const { gql, GraphQLClient } = require('graphql-request');
const config = require('config');
const logger = require('winston');

const client = new GraphQLClient(config.givethIoUrl);
const errors = require('@feathersjs/errors');
const axios = require('axios');
const { createBasicAuthentication } = require('../../utils/basicAuthUtility');
const { CampaignStatus } = require('../../models/campaigns.model');

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

const getUserByUserId = async userId => {
  try {
    const query = gql`
      query user($userId: Int!) {
        user(userId: $userId) {
          name
          firstName
          lastName
          email
          avatar
          walletAddress
          location
          url
        }
      }
    `;
    const result = await client.request(query, { userId: Number(userId) });
    const {
      name,
      firstName,
      lastName,
      walletAddress: address,
      email,
      avatar,
      location,
      url,
    } = result.user;
    return {
      name: name || `${firstName || ''} ${lastName || ''}`,
      address,
      email,
      avatar,
      location,
      url,
    };
  } catch (e) {
    logger.error('getUserByUserId error', e);
    throw e;
  }
};

const updateGivethIoProject = async ({
  title,
  description,
  campaignId,
  image,
  status,
  givethIoProjectId,
}) => {
  try {
    logger.info('updateGivethIoProject() has been called', {
      title,
      description,
      campaignId,
      image,
      status,
      givethIoProjectId,
    });
    const Authorization = createBasicAuthentication({
      username: config.givethIoInfo.givethIoUsername,
      password: config.givethIoInfo.givethIoPassword,
    });
    const url = `${config.givethIoUpdateProjectUrl}/${givethIoProjectId}`;
    await axios.put(
      url,
      {
        title,
        description,
        campaignId,
        image,
        archived: status === CampaignStatus.ARCHIVED || status === CampaignStatus.CANCELED,
      },
      {
        headers: {
          Authorization,
        },
      },
    );
    return true;
  } catch (e) {
    logger.error('updateGivethIoProject() error', {
      error: e,
      inputData: { title, description, campaignId, givethIoProjectId },
    });
    return false;
  }
};
module.exports = { getProjectInfoBySLug, getUserByUserId, updateGivethIoProject };
