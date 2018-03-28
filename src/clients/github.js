const GitHub = require('github-api')
const { GraphQLClient } = require('graphql-request')

const token = process.env.GH_TOKEN
const owner = process.env.GH_OWNER
const name = process.env.GH_REPOSITORY
const endpoint = process.env.GH_ENDPOINT

const graphqlClient = new GraphQLClient(endpoint, {
  headers: {
    Authorization: `bearer ${token}`,
  }
})

const apiV3 = new GitHub({token}).getIssues(`${owner}/${name}`)

module.exports = {
  graphqlClient,
  apiV3
}
