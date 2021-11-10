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
    const project = result.projectBySlug;
    const defaultImage =
      'https://ipfs.giveth.io/ipfs/QmeVDkwp9nrDsbAxLXY9yNW853C2F4CECC7wdvEJrroTqA';
    if (!project.description) {
      // because description in givethio is optional but in giveth trace is required
      project.description = project.title;
    }
    if (!project.image || /^\d+$/.test(project.image)) {
      // if givethIo image is undefined or is a number  (givethIo project with default image have numbers as image)
      // I set the our default image for them
      project.image = defaultImage;
    }
    return project;
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

module.exports = { getProjectInfoBySLug, getUserByUserId };
