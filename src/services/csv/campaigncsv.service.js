// const { Readable, Transform } = require('stream');
const Stream = require('stream');
const Web3 = require('web3');
const { Transform } = require('json2csv');
const { ObjectId } = require('mongoose').Types;
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');

const fields = [
  {
    label: 'Giver Address',
    value: 'from',
    default: 'NULL',
  },
  {
    label: 'Giver Name',
    value: 'fromName',
    default: 'Anonymous',
  },
  {
    label: 'Intended Project',
    value: 'to',
  },
  {
    label: 'Intended Project Title',
    value: 'toName',
  },
  {
    label: 'Transaction Hash',
    value: 'txHash',
  },
  {
    label: 'Amount',
    value: 'amount',
  },
  {
    label: 'Action',
    value: 'action',
  },
  {
    label: 'Date',
    value: 'date',
  },
  {
    label: 'Transaction Etherscan Link',
    value: 'etherscanLink',
  },
  {
    label: 'Home Transaction Etherscan Link',
    value: 'homeEtherscanLink',
  },
];

module.exports = function registerService() {
  const app = this;

  const donationService = app.service('donations');
  const campaignService = app.service('campaigns');
  const milestoneService = app.service('milestones');

  const dappUrl = app.get('dappUrl');
  const { etherscan, homeEtherscan } = app.get('blockchain');

  const stringIsEmpty = s => s === undefined || s === null || s === '';

  const newDonationTransform = () => {
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
      if (stringIsEmpty(etherscan) || stringIsEmpty(txHash)) return undefined;

      return `${etherscan}tx/${txHash}`;
    };

    const getHomeEtherscanLink = txHash => {
      if (stringIsEmpty(homeEtherscan) || stringIsEmpty(txHash)) return undefined;

      return `${homeEtherscan}tx/${txHash}`;
    };

    const isDelegate = async parentDonationId => {
      if (stringIsEmpty(parentDonationId)) return false;

      const [parent] = await donationService.find({
        query: {
          _id: parentDonationId,
          $select: ['parentDonations', 'status'],
        },
        paginate: false,
      });

      if (parent.status === DonationStatus.COMMITTED) return true;
      if (parent.parentDonations.length === 0) return false;
      return isDelegate(parent.parentDonations[0]);
    };

    return new Stream.Transform({
      objectMode: true,
      async transform(donation, _, callback) {
        const {
          txHash,
          homeTxHash,
          amount,
          giverAddress,
          ownerEntity,
          ownerType,
          token,
          giver,
          createdAt,
          parentDonations,
        } = donation;
        const donationIsDelegate = await isDelegate(parentDonations[0]);
        callback(null, {
          fromName: giver.name === '' ? 'Anonymous' : giver.name,
          from: giverAddress,
          toName: ownerEntity.title,
          to: getEntityLink(ownerEntity, ownerType),
          currency: token.name,
          amount: `${Web3.utils.fromWei(amount).toString()} ${token.name}`,
          action: donationIsDelegate ? 'Delegated' : 'Direct Donation',
          date: createdAt.toString(),
          txHash,
          etherscanLink: getEtherscanLink(txHash),
          homeEtherscanLink: getHomeEtherscanLink(homeTxHash),
        });
      },
    });
  };

  const getDonationStream = async id => {
    const milestones = await milestoneService.find({
      query: {
        campaignId: id,
        $select: ['id'],
      },
      paginate: false,
    });

    const query = {
      status: 'Committed',
      ownerTypeId: { $in: [id, ...milestones.map(m => m._id)] },
      $select: [
        '_id',
        'giverAddress',
        'ownerType',
        'ownerTypeId',
        'txHash',
        'homeTxHash',
        'amount',
        'createdAt',
        'token',
        'parentDonations',
      ],
    };

    let totalCount = 0;
    let cache = [];
    let noMoreData = false;

    const readable = new Stream.Readable({
      read() {
        if (cache.length > 0) {
          readable.push(cache.shift());
          return;
        }

        if (noMoreData) {
          readable.push(null);
          return;
        }

        donationService
          .find({
            query: {
              ...query,
              $skip: totalCount,
              $limit: 20,
            },
            schema: 'includeTypeAndGiverDetails',
          })
          .then(result => {
            const { data } = result;
            totalCount += data.length;
            if (totalCount === result.total) {
              noMoreData = true;
            }
            cache = data;
            readable.push(cache.shift());
          });
      },
      objectMode: true,
    });

    return readable;
  };

  const csvService = {
    async get(id) {
      if (!id || !ObjectId.isValid(id)) {
        return { error: 400 };
      }

      const result = await campaignService.find({
        query: {
          _id: id,
          $limit: 1,
          $select: [],
        },
      });
      if (result.total !== 1) {
        return { error: 404 };
      }

      return { campaignId: id };
    },
  };
  // Initialize our service with any options it requires
  app.use('/campaigncsv/', csvService, async (req, res, next) => {
    res.type('csv');
    const { error, campaignId } = res.data;

    if (error) {
      res.status(error).end();
      return;
    }

    const donationStream = await getDonationStream(campaignId);
    const json2csv = new Transform({ fields }, { objectMode: true });

    donationStream
      .on('error', next)
      .pipe(newDonationTransform())
      .on('error', next)
      .pipe(json2csv)
      .on('error', next)
      .pipe(res);
  });
};
