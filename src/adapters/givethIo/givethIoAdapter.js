const { gql, GraphQLClient } = require('graphql-request');
const config = require('config');
const logger = require('winston');

const client = new GraphQLClient(config.givethIoUrl);
const errors = require('@feathersjs/errors');

const getProjectInfoBySLug = async slug => {
  try {
    const query = gql`
      query ProjectBySlug($slug: String!) {
        projectBySlug(slug: $slug) {
          id
          title
          description
          image
          slug
          creationDate
          admin
          walletAddress
          impactLocation
          qualityScore
          totalDonations
          totalHearts
          verified
          categories {
            name
          }
          status {
            id
            symbol
            name
            description
          }
        }
      }
    `;
    const result = await client.request(query, { slug });
    return result.projectBySlug;
  } catch (e) {
    logger.error('getProjectInfoBySLug error', e);
    throw new errors.BadRequest('Project in givethIo with this slug not found');
  }
};

module.exports = { getProjectInfoBySLug };
