/* eslint-disable no-param-reassign */
const Stream = require('stream');
const Web3 = require('web3');
const logger = require('winston');
const MemoryCache = require('memory-cache');
const BigNumber = require('bignumber.js');
const { Transform } = require('json2csv');
const { ObjectId } = require('mongoose').Types;
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');
const { EventStatus } = require('../../models/events.model');
const { getTransaction } = require('../../blockchain/lib/web3Helpers');

module.exports = function csv() {
  const app = this;

  const eventService = app.service('events');
  const donationService = app.service('donations');
  const campaignService = app.service('campaigns');
  const milestoneService = app.service('milestones');
  const userService = app.service('users');

  const dappUrl = app.get('dappUrl');
  const donationModel = app.get('donationModel');
  const { etherscan, homeEtherscan, foreignNetworkName, homeNetworkName } = app.get('blockchain');
  const tokenWhiteList = app.get('tokenWhitelist');

  const tokenKey = (symbol, ownerType, type) => `${ownerType}_${symbol}_${type}`;
  const TokenKeyType = {
    BALANCE: 'balance',
    REQUESTED: 'requested',
    HOLD: 'hold',
    PAID: 'paid',
  };

  const csvFields = [
    {
      label: 'Time',
      value: 'createdAt',
    },
    {
      label: 'Action',
      value: 'action',
    },
    {
      label: 'Action Taker Name',
      value: 'actor',
      default: 'Anonymous',
    },
    {
      label: 'Acting on behalf of',
      value: 'actionOnBehalfOf',
      default: 'Anonymous',
    },
    {
      label: 'Recipient of Action',
      value: 'recipientName',
    },
    {
      label: 'Recipient Type',
      value: 'recipientType',
    },
    {
      label: 'Recipient Link',
      value: 'recipient',
    },
    {
      label: 'Tx Amount',
      value: 'amount',
    },
    {
      label: 'Tx Currency',
      value: 'currency',
    },
    {
      label: 'Action Taker Address',
      value: 'actionTakerAddress',
      default: 'NULL',
    },
    {
      label: 'Action Recipient Address',
      value: 'actionRecipientAddress',
      default: 'NULL',
    },
    {
      label: `${foreignNetworkName} Transaction`,
      value: 'etherscanLink',
    },
    {
      label: `${homeNetworkName} Transaction`,
      value: 'homeEtherscanLink',
    },
    ...tokenWhiteList
      .map(token => [
        {
          label: `${token.symbol} Available in Campaign`,
          value: tokenKey(token.symbol, 'campaign', TokenKeyType.BALANCE),
          default: '0',
        },
        {
          label: `${token.symbol} Committed in All Milestones`,
          value: tokenKey(token.symbol, 'milestones', TokenKeyType.BALANCE),
          default: '0',
        },
      ])
      .reduce((acc, val) => acc.concat(val), []),
    ...tokenWhiteList
      .map(token => [
        {
          label: `${token.symbol} Amount Milestone Requested`,
          value: tokenKey(token.symbol, 'milestone', TokenKeyType.REQUESTED),
          default: '-',
        },
        {
          label: `${token.symbol} Amount Milestone Holds`,
          value: tokenKey(token.symbol, 'milestone', TokenKeyType.HOLD),
          default: '-',
        },
        {
          label: `${token.symbol} Amount Milestone Paid Out`,
          value: tokenKey(token.symbol, 'milestone', TokenKeyType.PAID),
          default: '-',
        },
      ])
      .reduce((acc, val) => acc.concat(val), []),
  ];

  // Transform donations related to a campaign to csv items
  const getEntityLink = (entity, type) => {
    switch (type) {
      case AdminTypes.CAMPAIGN:
        return `${dappUrl}/campaigns/${entity._id.toString()}`;

      case AdminTypes.MILESTONE:
        return `${dappUrl}/campaigns/${entity.campaignId}/milestones/${entity._id.toString()}`;

      default:
        return '';
    }
  };

  const getEtherscanLink = txHash => {
    if (!etherscan || !txHash) return undefined;

    return `${etherscan}tx/${txHash}`;
  };

  const getHomeEtherscanLink = txHash => {
    if (!homeEtherscan || !txHash) return undefined;

    return `${homeEtherscan}tx/${txHash}`;
  };

  const donationDelegateStatus = async parentDonationId => {
    if (!parentDonationId) {
      return {
        isDelegate: false,
      };
    }

    const [parent] = await donationService.find({
      query: {
        _id: parentDonationId,
        $select: ['parentDonations', 'status', 'ownerTypeId'],
      },
      paginate: false,
    });

    if (!parent) {
      logger.error(`No parent donation with id ${parentDonationId} found`);
      return {
        isDelegate: false,
      };
    }

    if (parent.status === DonationStatus.COMMITTED) {
      return {
        isDelegate: true,
        parentOwnerTypeId: parent.ownerTypeId,
      };
    }

    if (parent.parentDonations.length === 0) {
      return {
        isDelegate: false,
      };
    }

    return donationDelegateStatus(parent.parentDonations[0]);
  };

  const getUser = async address => {
    const [user] = await userService.find({
      query: {
        address,
        $select: ['name'],
        $limit: 1,
      },
      paginate: false,
    });
    return user;
  };

  const newEventTransform = (campaign, milestones, pledgeIds) => {
    const { id: campaignId } = campaign;
    const campaignBalance = {};
    const milestonesBalance = {};
    const milestoneMap = new Map();
    milestones.forEach(milestone => {
      const { projectId, migratedProjectId } = milestone;
      const key = migratedProjectId || projectId;
      milestoneMap.set(key, milestone);
    });

    const initializeMilestoneBalance = milestone => {
      const { _id, maxAmount, token } = milestone;
      const { symbol } = token;
      const balance = {};
      if (symbol === 'ANY_TOKEN') {
        tokenWhiteList.forEach(t => {
          balance[t.symbol] = {};
          balance[t.symbol][TokenKeyType.HOLD] = new BigNumber(0);
          balance[t.symbol][TokenKeyType.PAID] = new BigNumber(0);
        });
      } else {
        balance[symbol] = {};
        balance[symbol][TokenKeyType.HOLD] = new BigNumber(0);
        balance[symbol][TokenKeyType.PAID] = new BigNumber(0);
        if (maxAmount) balance[symbol][TokenKeyType.REQUESTED] = new BigNumber(maxAmount);
      }

      milestonesBalance[_id.toString()] = balance;
      return balance;
    };

    // Get milestone balance items
    const insertMilestoneBalanceItems = (id, result) => {
      const balance = milestonesBalance[id.toString()];
      Object.keys(balance).forEach(symbol => {
        const tokenBalance = balance[symbol];
        [TokenKeyType.REQUESTED, TokenKeyType.HOLD, TokenKeyType.PAID].forEach(type => {
          const value = tokenBalance[type];
          if (value) {
            const key = tokenKey(symbol, AdminTypes.MILESTONE, type);
            result[key] = Web3.utils.fromWei(value.toFixed());
          }
        });
      });
    };

    let campaignOwner;

    const updateCampaignBalance = (donation, isDelegate, parentId) => {
      const { ownerTypeId, amount, token } = donation;

      let balanceChange;
      if (ownerTypeId === campaignId) {
        balanceChange = new BigNumber(amount.toString());
      } else if (isDelegate && parentId === campaignId) {
        balanceChange = new BigNumber(amount.toString()).negated();
      } else {
        // Does not affect campaign balance
        return;
      }

      const { symbol } = token;
      const currentBalance = campaignBalance[symbol];
      if (!currentBalance) {
        campaignBalance[symbol] = balanceChange;
      } else {
        campaignBalance[symbol] = currentBalance.plus(balanceChange);
      }
    };

    return new Stream.Transform({
      objectMode: true,
      async transform(eventObject, _, callback) {
        const { event, transactionHash, returnValues, createdAt } = eventObject;
        let result = {
          createdAt: createdAt.toString(),
        };
        switch (event) {
          case 'ProjectAdded':
            {
              const projectId = Number(returnValues.idProject);
              if (campaign.projectId === projectId) {
                const { from } = await getTransaction(app, transactionHash);
                const actionTaker = await getUser(from);
                campaignOwner = from;
                result = {
                  ...result,
                  action: 'Campaign Created',
                  actor: 'Creator',
                  actionOnBehalfOf: actionTaker ? actionTaker.name : undefined,
                  recipientName: campaign.title,
                  recipientType: 'Campaign',
                  recipient: getEntityLink(campaign, AdminTypes.CAMPAIGN),
                  actionTakerAddress: from,
                  actionRecipientAddress: campaign.pluginAddress,
                  etherscanLink: getEtherscanLink(transactionHash),
                };
              } else {
                const milestone = milestoneMap.get(projectId);
                if (milestone) {
                  const { from } = await getTransaction(app, transactionHash);
                  const actionTaker = await getUser(from);
                  const action =
                    campaignOwner === actionTaker ? 'Milestone Added' : 'Milestone Accepted';
                  result = {
                    ...result,
                    action,
                    actor: actionTaker.name,
                    actionOnBehalfOf: campaign.title,
                    recipientName: milestone.title,
                    recipientType: 'Milestone',
                    recipient: getEntityLink(milestone, AdminTypes.MILESTONE),
                    actionTakerAddress: from,
                    actionRecipientAddress: milestone.pluginAddress,
                    etherscanLink: getEtherscanLink(transactionHash),
                  };
                  initializeMilestoneBalance(milestone);
                  insertMilestoneBalanceItems(milestone._id, result);
                } else {
                  logger.error(
                    `campaign csv could'nt find corresponding project to id ${projectId}`,
                  );
                }
              }
            }
            break;

          // case 'Transfer':
          //   {
          //     let pledgeId;
          //     const { from, to } = returnValues;
          //     if (pledgeIds.has(to)) {
          //       pledgeId = to;
          //     } else {
          //       pledgeId = from;
          //     }
          //     const [donation] = await donationService.find({
          //       query: { txHash: transactionHash, pledgeId },
          //       paginate: false,
          //     });
          //     const {
          //       txHash,
          //       homeTxHash,
          //       amount,
          //       giverAddress,
          //       ownerEntity,
          //       ownerType,
          //       token,
          //       parentDonations,
          //       actionTakerAddress,
          //       status,
          //       isReturn,
          //     } = donation;
          //
          //     let action;
          //     let realActionTakerAddress;
          //
          //     if (isReturn) {
          //       action = 'Return';
          //       realActionTakerAddress = actionTakerAddress;
          //       updateCampaignBalance(donation, false);
          //     } else {
          //       const { isDelegate, parentOwnerTypeId } = await donationDelegateStatus(
          //         parentDonations[0],
          //       );
          //       realActionTakerAddress = isDelegate ? actionTakerAddress : giverAddress;
          //       action = isDelegate ? 'Delegated' : 'Direct Donation';
          //       if (status === DonationStatus.CANCELED) {
          //         action += ' - Canceled Later';
          //       }
          //       updateCampaignBalance(donation, isDelegate, parentOwnerTypeId);
          //     }
          //
          //     const actionTaker = await getUser(realActionTakerAddress);
          //
          //     result = {
          //       recipientName: ownerEntity.title,
          //       recipient: getEntityLink(ownerEntity, ownerType),
          //       currency: token.name,
          //       amount: Web3.utils.fromWei(amount).toString(),
          //       action,
          //       createdAt: createdAt.toString(),
          //       etherscanLink: getEtherscanLink(txHash),
          //       homeEtherscanLink: getHomeEtherscanLink(homeTxHash),
          //       actor: actionTaker ? actionTaker.name : undefined,
          //       actionTakerAddress: realActionTakerAddress,
          //     };
          //
          //     Object.keys(campaignBalance).forEach(symbol => {
          //       result[tokenKey(symbol)] = Web3.utils.fromWei(campaignBalance[symbol].toFixed());
          //     });
          //   }
          //   break;
          default:
        }

        Object.keys(campaignBalance).forEach(symbol => {
          result[tokenKey(symbol)] = Web3.utils.fromWei(campaignBalance[symbol].toFixed());
        });
        callback(null, result);
      },
    });
  };

  // Get stream of items to be written to csv for the campaign, plus milestones of this campaign
  const getData = async campaign => {
    const { _id: id, projectId } = campaign;
    const milestones = await milestoneService.find({
      query: {
        campaignId: id,
        $select: [
          '_id',
          'projectId',
          'migratedProjectId',
          'createdAt',
          'ownerAddress',
          'token',
          'title',
          'pluginAddress',
          'campaignId',
          'maxAmount',
        ],
        $sort: { createdAt: 1 },
      },
      paginate: false,
    });

    const findQueryStream = (service, query, params = {}) => {
      let totalCount = 0;
      let cache = [];
      let noMoreData = false;

      const stream = new Stream.Readable({
        read() {
          if (cache.length > 0) {
            stream.push(cache.shift());
            return;
          }

          if (noMoreData) {
            stream.push(null);
            return;
          }

          service
            .find({
              query: {
                ...query,
                $skip: totalCount,
                $limit: 100,
              },
              ...params,
            })
            .then(result => {
              console.log(result.total);
              const { data } = result;
              console.log(data.length);
              totalCount += data.length;
              if (totalCount === result.total) {
                noMoreData = true;
              }
              cache = data;
              stream.push(cache.shift());
            });
        },
        objectMode: true,
      });

      return stream;
    };

    // List of pledges ID owned by campaign and its milestones

    const result = await donationModel.distinct('pledgeId', {
      ownerTypeId: { $in: [id, ...milestones.map(m => m._id)] },
      status: { $in: [DonationStatus.COMMITTED, DonationStatus.CANCELED] },
    });
    const pledgeIds = result.map(String);
    // List of projects ID of campaign and its milestones
    const projectIds = [String(projectId)];
    milestones.forEach(milestone => {
      const { projectId: milestoneProjectId, migratedProjectId } = milestone;
      if (migratedProjectId) {
        projectIds.push(String(migratedProjectId));
      } else if (milestoneProjectId && milestoneProjectId > 0) {
        projectIds.push(String(milestoneProjectId));
      }
    });
    // const donationQuery = {
    //   status: { $in: [DonationStatus.COMMITTED, DonationStatus.CANCELED] },
    //   ownerTypeId: { $in: [id, ...milestones.map(m => m._id)] },
    //   $sort: { createdAt: 1 },
    //   $select: [
    //     '_id',
    //     'giverAddress',
    //     'ownerType',
    //     'ownerTypeId',
    //     'txHash',
    //     'homeTxHash',
    //     'amount',
    //     'createdAt',
    //     'token',
    //     'parentDonations',
    //     'actionTakerAddress',
    //     'status',
    //     'isReturn',
    //   ],
    // };

    // const donationStream = findQueryStream(donationService, donationQuery, {
    //   schema: 'includeTypeDetails',
    // });
    const eventQuery = {
      status: EventStatus.PROCESSED,
      $or: [
        {
          event: {
            $in: [
              'ProjectAdded',
              'ProjectUpdated',
              'CancelProject',
              'MilestoneCompleteRequestApproved',
              'MilestoneCompleteRequestRejected',
              'MilestoneCompleteRequested',
              'PaymentCollected',
              'RecipientChanged',
            ],
          },
          'returnValues.idProject': { $in: projectIds.map(String) },
        },
        // {
        //   event: 'Transfer',
        //   $or: [
        //     { 'returnValues.from': { $in: pledgeIds } },
        //     { 'returnValues.to': { $in: pledgeIds } },
        //   ],
        // },
      ],
      $select: ['event', 'returnValues', 'transactionHash', 'createdAt'],
      $sort: { blockNumber: 1, transactionIndex: 1, logIndex: 1 },
    };

    const eventsStream = findQueryStream(eventService, eventQuery);
    return { eventsStream, milestones, pledgeIds: new Set(pledgeIds) };
  };

  const getCampaignInfo = {
    async get(id) {
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }

      const result = await campaignService.find({
        query: {
          _id: id,
          $limit: 1,
        },
      });
      if (result.total !== 1) {
        return { error: 404 };
      }
      const campaign = result.data[0];
      return { campaign };
    },
  };

  // Transform csv items in json format to csv format
  const newCsvTransform = () => {
    return new Transform({ fields: csvFields }, { objectMode: true });
  };

  const csvService = async (req, res, next) => {
    const { campaign } = req;
    const { id } = campaign;
    res.type('csv');
    res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);

    const { eventsStream, milestones, pledgeIds } = await getData(campaign);
    const chunks = [];
    eventsStream
      .on('error', next)
      .pipe(newEventTransform(campaign, milestones, pledgeIds))
      .on('error', next)
      .pipe(newCsvTransform())
      .on('error', next)
      .on('data', chunk => {
        chunks.push(chunk);
      })
      .on('finish', () => {
        res.send(chunks.join(''));
      });
  };

  const cacheMiddleWare = (req, res, next) => {
    const { error, campaign } = res.data;

    const { id, updatedAt } = campaign;

    if (error) {
      res.status(error).end();
      return;
    }

    const value = MemoryCache.get(id);

    if (value && value.updatedAt.getTime() === updatedAt.getTime()) {
      res.type('csv');
      res.setHeader('Content-disposition', `attachment; filename=${id}.csv`);
      res.send(value.body);
      return;
    }

    res.sendResponse = res.send;
    res.send = body => {
      MemoryCache.put(id, { updatedAt, body });
      res.sendResponse(body);
      res.end();
    };

    req.campaign = campaign;

    next();
  };

  // Initialize our service with any options it requires
  app.use('/campaigncsv/', getCampaignInfo, cacheMiddleWare, csvService);
};
