const { gql, GraphQLClient } = require('graphql-request');
const config = require('config');

const client = new GraphQLClient(config.givethIoUrl);

const getProjectInfoBySLug = async slug => {
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
  return client.request(query, { slug });
};

module.exports = { getProjectInfoBySLug };
