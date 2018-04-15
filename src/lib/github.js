const GitHub = require('github-api')
const { GraphQLClient } = require('graphql-request')

const config = require('../config')

const { token, repo, owner, graphql } = config.github

const graphqlClient = new GraphQLClient(graphql, {
  headers: {
    Authorization: `bearer ${token}`,
  }
})

const issues = new GitHub({token}).getIssues(`${owner}/${repo}`)

module.exports = {
  issues,
  graphqlClient
}
