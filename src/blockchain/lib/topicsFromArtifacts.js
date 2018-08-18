const { keccak256 } = require('web3-utils');

/**
 * Generate a list of topics, for any event in the artifacts.
 *
 * @param {array} artifacts array of solcpiler generated artifact for a solidity contract
 * @param {array} names list of events names to generate topics for
 * @returns {array} array of topics used to subscribe to the events for the contract
 */
function topicsFromArtifacts(artifacts, names) {
  return artifacts
    .reduce(
      (accumulator, artifact) =>
        accumulator.concat(
          artifact.compilerOutput.abi.filter(
            method => method.type === 'event' && names.includes(method.name),
          ),
        ),
      [],
    )
    .reduce(
      (accumulator, event) =>
        accumulator.concat({
          name: event.name,
          hash: keccak256(`${event.name}(${event.inputs.map(i => i.type).join(',')})`),
        }),
      [],
    );
}

module.exports = topicsFromArtifacts;
