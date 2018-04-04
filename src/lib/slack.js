const Slack = require('@slack/client').WebClient
const fetch = require('node-fetch')
const queryString = require('query-string')

const config = require('../config')

const { token, bot: botToken } = config.slack

const client = new Slack(token)
const bot = new Slack(botToken)

function createSlackGroup (name) {
  return new Promise(async (resolve, reject) => {
    const groupId = await getSlackGroupID(name)
    if (groupId) return resolve(groupId)
    return client.groups.create(name,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data.group.id)
      })
  })
}

function archiveSlackGroup (name) {
  return new Promise(async (resolve, reject) => {
    const groupId = await getSlackGroupID(name)
    if (groupId) return resolve(groupId)
    return client.groups.archive(groupId,
      (err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
  })
}

function unarchiveSlackGroup (name) {
  return new Promise(async (resolve, reject) => {
    const groupId = await getSlackGroupID(name)
    if (groupId) return resolve(groupId)
    return client.groups.unarchive(groupId,
      (err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
  })
}

function setSlackGroupPurpose (groupID, purpose='') {
  return new Promise((resolve, reject) => {
    return client.groups.setPurpose(groupID, purpose,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data)
      })
  })
}

function setSlackGroupTopic (groupID, topic='') {
  return new Promise((resolve, reject) => {
    return client.groups.setTopic(groupID, topic,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data)
      })
  })
}

function inviteBotToSlackGroup (groupID, userID) {
  return new Promise((resolve, reject) => {
    return client.groups.invite(groupID, userID,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data)
      })
  })
}

function inviteToSlackGroup (groupID, userID) {
  return new Promise((resolve, reject) => {
    return client.groups.invite(groupID, userID,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data)
      })
  })
}

function postMessageToSlack (id, text='') {
  return new Promise((resolve, reject) => {
    return bot.chat.postMessage(id, text,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data)
      })
  })
}


function getSlackUserID (name) {
  return new Promise((resolve, reject) => {
    return client.users.list((err, data) => {
      let userID = null
      if (err) return reject(err)
      for (const user of data.members) {
        if (`@${user.name}` === name) {
          userID = user.id
          break
        }
      }
      return resolve(userID)
    }, {
      limit: 1000
    })
  })
}

function getSlackUserIDByEmail (email) {
  return new Promise(async (resolve, reject) => {
    const teamID = await getSlackTeamID()
    const params = {
      team: teamID,
      token,
      email
    }
    return fetch(` https://slack.com/api/auth.findUser?${queryString.stringify(params)}`)
      .then((res) => res.json())
      .then((body) => {
        const { ok, user_id } = body
        if (!ok) reject(new Error('User not found'))
        resolve(user_id)
      })
  })
}

function getSlackGroupID (name) {
  return new Promise((resolve, reject) => {
    return client.groups.list((err, data) => {
      let groupID = null
      if (err) return reject(err)
      for (const group of data.groups) {
        if (group.name === name) {
          groupID = group.id
          break
        }
      }
      return resolve(groupID)
    }, {
      limit: 1000,
      exclude_archived: true,
      exclude_members: true
    })
  })
}

function getSlackTeamID () {
  return new Promise((resolve, reject) => {
    return client.team.info((err, data) => {
      if (err) return reject(err)
      return resolve(data.team.id)
    })
  })
}

function getSlackProfile (userID) {
  return new Promise((resolve, reject) => {
    return client.users.info(userID,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data.user)
    })
  })
}

function retrieveSlackHistory (groupID) {
  return new Promise((resolve, reject) => {
    return client.groups.history(groupID,
      (err, data) => {
        if (err) return reject(err)
        return resolve(data.messages
          .filter((message) => message.type === 'message' && !message.subtype))
      }, {
        count: 1000
      })
  })
}
module.exports = {
  client,
  createSlackGroup,
  archiveSlackGroup,
  unarchiveSlackGroup,
  inviteToSlackGroup,
  inviteBotToSlackGroup,
  getSlackUserIDByEmail,
  getSlackUserID,
  getSlackGroupID,
  getSlackTeamID,
  getSlackProfile,
  setSlackGroupTopic,
  setSlackGroupPurpose,
  postMessageToSlack,
  retrieveSlackHistory
}
