const Contract = require('web3-eth-contract');

/**
 * @param {object} artifact solcpiler generated artifact for a solidity contract
 * @returns {object} map of event names => log decoder
 */
function eventDecodersFromArtifact(artifact) {
  return artifact.compilerOutput.abi.filter(method => method.type === 'event').reduce(
    (decoders, event) =>
      Object.assign({}, decoders, {
        [event.name]: Contract.prototype._decodeEventABI.bind(event),
      }),
    {},
  );
}

module.exports = eventDecodersFromArtifact;
