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
  const dacService = app.service('dacs');
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

  const capitalizeAdminType = type => {
    if (type.toLowerCase() === 'dac') return 'DAC';
    return type.charAt(0).toUpperCase() + type.slice(1);
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

      case AdminTypes.GIVER:
        return `${dappUrl}/profile/${entity.address}`;
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
        $select: [
          'parentDonations',
          'status',
          'ownerTypeId',
          'ownerType',
          'delegateType',
          'delegateTypeId',
        ],
      },
      paginate: false,
    });

    if (!parent) {
      logger.error(`No parent donation with id ${parentDonationId} found`);
      return {
        isDelegate: false,
      };
    }

    const {
      status,
      delegateTypeId,
      delegateType,
      ownerTypeId,
      parentDonations,
      ownerType,
    } = parent;

    if (status === DonationStatus.COMMITTED) {
      return {
        isDelegate: true,
        parentOwnerTypeId: delegateTypeId || ownerTypeId,
        parentOwnerType: delegateType || ownerType,
      };
    }

    if (parentDonations.length === 0) {
      return {
        isDelegate: false,
      };
    }

    return donationDelegateStatus(parentDonations[0]);
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
    const campaignId = campaign._id.toString();
    const campaignBalance = {
      campaignCommitted: {},
      milestonesCommitted: {},
    };
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

    const insertCampaignBalanceItems = result => {
      const { campaignCommitted, milestonesCommitted } = campaignBalance;
      Object.keys(campaignCommitted).forEach(symbol => {
        result[tokenKey(symbol, 'campaign', TokenKeyType.BALANCE)] = Web3.utils.fromWei(
          campaignCommitted[symbol].toFixed(),
        );
      });
      Object.keys(milestonesCommitted).forEach(symbol => {
        result[tokenKey(symbol, 'milestones', TokenKeyType.BALANCE)] = Web3.utils.fromWei(
          milestonesCommitted[symbol].toFixed(),
        );
      });
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

    const updateBalance = (donation, isDelegate, parentId) => {
      const { ownerType, ownerTypeId, amount, token, status } = donation;

      let balanceChange;
      let updateCampaignCommitted = false;
      if (ownerTypeId === campaignId) {
        balanceChange = new BigNumber(amount.toString());
        updateCampaignCommitted = true;
      } else if (isDelegate && parentId === campaignId) {
        balanceChange = new BigNumber(amount.toString()).negated();
        updateCampaignCommitted = true;
      }

      const { symbol } = token;
      if (updateCampaignCommitted) {
        const { campaignCommitted } = campaignBalance;
        const currentCampaignCommitted = campaignCommitted[symbol];
        if (!currentCampaignCommitted) {
          campaignCommitted[symbol] = balanceChange;
        } else {
          campaignCommitted[symbol] = currentCampaignCommitted.plus(balanceChange);
        }
      }

      if (ownerType === AdminTypes.MILESTONE) {
        const balance = milestonesBalance[ownerTypeId];
        if (status === DonationStatus.PAID) {
          balance[symbol][TokenKeyType.HOLD] = balance[symbol][TokenKeyType.HOLD].minus(amount);
          balance[symbol][TokenKeyType.PAID] = balance[symbol][TokenKeyType.PAID].plus(amount);
          balanceChange = new BigNumber(amount.toString()).negated();
        } else {
          balance[symbol][TokenKeyType.HOLD] = balance[symbol][TokenKeyType.HOLD].plus(amount);
          balanceChange = new BigNumber(amount.toString());
        }
        const { milestonesCommitted } = campaignBalance;
        const currentMilestonesCommitted = milestonesCommitted[symbol];
        if (!currentMilestonesCommitted) {
          milestonesCommitted[symbol] = balanceChange;
        } else {
          milestonesCommitted[symbol] = currentMilestonesCommitted.plus(balanceChange);
        }
      }
    };

    let payouts = {};

    const flushPayouts = async stream => {
      const { transactionHash } = payouts;

      // Do nothing if payouts is empty
      if (transactionHash) {
        const { ownerEntity, actionTakerAddress, commitTime } = payouts;
        const recipient = (await getUser(ownerEntity.recipientAddress)) || {};
        recipient.address = ownerEntity.recipientAddress;
        const result = {
          createdAt: commitTime.toString(),
          action: 'Milestone Paid Out',
          actor:
            actionTakerAddress === ownerEntity.ownerAddress
              ? 'Milestone Proposer'
              : 'Milestone Recipient',
          actionOnBehalfOf: ownerEntity.title,
          recipientName: recipient.name,
          recipientType: 'Givether',
          recipient: getEntityLink(recipient, AdminTypes.GIVER),
          amount: '-',
          currency: '-',
          actionTakerAddress,
          actionRecipientAddress: ownerEntity.pluginAddress,
          etherscanLink: getEtherscanLink(transactionHash),
        };

        insertCampaignBalanceItems(result);
        insertMilestoneBalanceItems(ownerEntity._id, result);

        // Clear payouts
        payouts = {};

        stream.push(result);
      }
    };

    const addPayout = async (stream, donation, createdAt) => {
      updateBalance(donation, false);
      const { transactionHash, balance = {} } = payouts;
      const {
        amount,
        actionTakerAddress,
        commitTime = createdAt,
        ownerEntity,
        txHash,
        token,
        ownerTypeId,
      } = donation;
      // Its a new payouts, the collected one should be printed
      if (transactionHash && transactionHash !== txHash) {
        await flushPayouts(stream);
      }

      payouts.ownerId = ownerTypeId;
      const { symbol } = token;
      const tokenBalance = balance[symbol] || new BigNumber(0);
      tokenBalance.plus(amount);
      balance[symbol] = tokenBalance;

      // This is new payout, info should be filled.
      // Fill the info by the first donation only, all donations of one payout has the similar value;
      if (transactionHash !== txHash) {
        payouts.transactionHash = txHash;
        payouts.balance = balance;
        payouts.ownerEntity = ownerEntity;
        payouts.actionTakerAddress = actionTakerAddress;
        payouts.commitTime = commitTime;
      }

      // Some donations doesn't have commitTime,
      // Fill payouts if the first donation doesn't have commitTime
      if (!payouts.commitTime) {
        payouts.commitTime = commitTime;
      }
    };

    let counter = 0; // TODO: for debug, should be removed
    return new Stream.Transform({
      objectMode: true,
      async transform(eventObject, _, callback) {
        counter += 1;
        console.log('counter:', counter);
        const { event, transactionHash, returnValues, createdAt } = eventObject;
        let result = {
          createdAt: createdAt.toString(),
        };

        console.log('event:', event);
        switch (event) {
          case 'ProjectAdded':
            {
              // Flush any payout if exists
              await flushPayouts(this);

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

          case 'Transfer':
            {
              let pledgeId;
              let exitDonation = false; // Money exits from campaign/milestone
              const { from, to, amount } = returnValues;

              if (pledgeIds.has(to)) {
                pledgeId = to;
              } else {
                pledgeId = from;
                exitDonation = true;
              }

              const [donation] = await donationService.find({
                query: { txHash: transactionHash, pledgeId, amount },
                paginate: false,
                schema: 'includeTypeDetails',
              });

              // Donation not found, put the event data
              if (!donation) {
                result = {
                  ...result,
                  etherscanLink: getEtherscanLink(transactionHash),
                  amount: Web3.utils.fromWei(amount).toString(),
                };
                callback(null, result);
                return;
              }

              const {
                homeTxHash,
                giverAddress,
                ownerEntity,
                ownerType,
                token,
                parentDonations,
                actionTakerAddress,
                status,
                isReturn,
                commitTime = createdAt,
              } = donation;

              let action;
              let actor;
              let realActionTakerAddress;
              let actionOnBehalfOf;

              const capitalizeOwnerType = capitalizeAdminType(ownerType);

              if (isReturn) {
                action = 'Return';
                realActionTakerAddress = actionTakerAddress;
                updateBalance(donation, false);
              } else if (!exitDonation) {
                if (status === DonationStatus.PAID) {
                  await addPayout(this, donation, createdAt);
                  // Payouts should be accumulated and printed once
                  callback();
                  return;
                }

                // Flush any payout if exists
                await flushPayouts(this);
                const {
                  isDelegate,
                  parentOwnerTypeId,
                  parentOwnerType,
                } = await donationDelegateStatus(parentDonations[0]);

                // Update campaign and milestones balance
                updateBalance(donation, isDelegate, parentOwnerTypeId);

                // Action and Actor
                if (isDelegate) {
                  const capitalizedParentOwnerType = capitalizeAdminType(parentOwnerType);
                  action = `${capitalizedParentOwnerType} Delegated to ${capitalizeOwnerType}`;
                  actor = `${capitalizedParentOwnerType} Manager`;
                } else if (ownerType === AdminTypes.CAMPAIGN) {
                  action = 'Campaign Received Donation';
                  actor = 'Donor';
                } else {
                  action = 'Direct Donation to Milestone';
                  actor = 'Giver';
                }

                realActionTakerAddress = isDelegate ? actionTakerAddress : giverAddress;
                if (status === DonationStatus.CANCELED) {
                  action += ' - Canceled Later';
                }
                const actionTaker = await getUser(realActionTakerAddress);

                if (!isDelegate) {
                  actionOnBehalfOf = actionTaker.name;
                } else {
                  let service;
                  if (parentOwnerType === AdminTypes.DAC) {
                    service = dacService;
                  } else {
                    // Campaignn
                    service = campaignService;
                  }
                  const [parentOwner] = await service.find({
                    query: {
                      _id: parentOwnerTypeId,
                      $select: ['title'],
                    },
                    paginate: false,
                  });
                  actionOnBehalfOf = parentOwner && parentOwner.title;
                }
              }
              result = {
                ...result,
                action,
                actor,
                actionOnBehalfOf,
                recipientName: ownerEntity.title,
                recipientType: capitalizeOwnerType,
                recipient: getEntityLink(ownerEntity, ownerType),
                amount: Web3.utils.fromWei(amount).toString(),
                currency: token.name,
                createdAt: commitTime.toString(),
                actionTakerAddress: realActionTakerAddress,
                actionRecipientAddress: ownerEntity.pluginAddress,
                etherscanLink: getEtherscanLink(transactionHash),
                homeEtherscanLink: getHomeEtherscanLink(homeTxHash),
              };

              if (ownerType === AdminTypes.MILESTONE) {
                insertMilestoneBalanceItems(ownerEntity._id, result);
              }
            }
            break;
          default:
        }

        insertCampaignBalanceItems(result);

        callback(null, result);
      },
      async flush(callback) {
        await flushPayouts(this);
        callback();
        console.log('finished....');
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
      status: { $in: [DonationStatus.COMMITTED, DonationStatus.PAID, DonationStatus.CANCELED] },
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
              // 'ProjectUpdated',
              // 'CancelProject',
              // 'MilestoneCompleteRequestApproved',
              // 'MilestoneCompleteRequestRejected',
              // 'MilestoneCompleteRequested',
              // 'PaymentCollected',
              // 'RecipientChanged',
            ],
          },
          'returnValues.idProject': { $in: projectIds.map(String) },
        },
        {
          event: 'Transfer',
          $or: [
            // { 'returnValues.from': { $in: pledgeIds } },
            { 'returnValues.to': { $in: pledgeIds } },
          ],
        },
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
