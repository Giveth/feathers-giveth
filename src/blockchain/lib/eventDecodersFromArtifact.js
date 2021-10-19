const Contract = require('web3-eth-contract');

/**
 * @param {object} artifact solcpiler|embark generated artifact for a solidity contract
 * @returns {object} map of event names => log decoder
 */
function eventDecodersFromArtifact({ compilerOutput, abiDefinition }) {
  const abi = compilerOutput ? compilerOutput.abi : abiDefinition;
  if (!abi) return {};

  return abi
    .filter(method => method.type === 'event')
    .reduce(
      (decoders, event) => ({
        ...decoders,
        [event.name]: Contract.prototype._decodeEventABI.bind(event),
      }),
      {},
    );
}

module.exports = eventDecodersFromArtifact;
