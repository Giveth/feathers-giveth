const { Transform } = require('json2csv');
const { tokenKey, TokenKeyType } = require('./utils');

module.exports = app => {
  const getNewCsvTransform = () => {
    const { foreignNetworkName, homeNetworkName } = app.get('blockchain');
    const tokenWhiteList = app.get('tokenWhitelist');
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
            label: `${token.symbol} Committed in All Traces`,
            value: tokenKey(token.symbol, 'traces', TokenKeyType.BALANCE),
            default: '0',
          },
        ])
        .reduce((acc, val) => acc.concat(val), []),
      ...tokenWhiteList
        .map(token => [
          {
            label: `${token.symbol} Amount Trace Requested`,
            value: tokenKey(token.symbol, 'trace', TokenKeyType.REQUESTED),
            default: '-',
          },
          {
            label: `${token.symbol} Amount Trace Holds`,
            value: tokenKey(token.symbol, 'trace', TokenKeyType.HOLD),
            default: '-',
          },
          {
            label: `${token.symbol} Amount Trace Paid Out`,
            value: tokenKey(token.symbol, 'trace', TokenKeyType.PAID),
            default: '-',
          },
          {
            label: `${token.symbol} bridgePaymentExecutedTime`,
            value: `${token.symbol}-bridgePaymentExecutedTime`,
            default: '-',
          },
          {
            label: `${token.symbol} bridgeTransactionLink`,
            value: `${token.symbol}-bridgeTransactionLink`,
            default: '-',
          },
        ])
        .reduce((acc, val) => acc.concat(val), []),
    ];

    return new Transform({ fields: csvFields }, { objectMode: true });
  };

  return {
    getNewCsvTransform,
  };
};
