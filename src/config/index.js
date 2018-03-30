if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ silent: true })
}
const server = require('./components/server')
const airtable = require('./components/airtable')
const google = require('./components/google')
const github = require('./components/github')
const slack = require('./components/slack')
const team = require('./components/team')

module.exports = Object.assign({}, server, airtable, google, github, slack, team)
