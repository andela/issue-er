const Slack = require('@slack/client').WebClient
const fetch = require('node-fetch')
const queryString = require('query-string')

const config = require('../config')

const { token, bot: botToken } = config.slack
const { admin } = config.team

const client = new Slack(token)
const bot = new Slack(botToken)

async function createSlackGroup (name) {

  if (!name) return new Error('missing_name')

  try {

    const groupId = await getSlackGroupID(name)

    if (groupId) return groupId

    const { data: { group: { id } } } = await client.groups.create(name)

    return id
  } catch (err) {
    console.log(err)
  }
}

async function archiveSlackGroup (name) {

  if (!name) return new Error('missing_name')

  try {

    const groupId = await getSlackGroupID(name)

    if (groupId) {
      return await client.groups.archive(groupId)
    }
  } catch(err) {
    console.log(err)
  }
}

async function unarchiveSlackGroup (name) {

  if (!name) return new Error('missing_name')

  try {

    const groupId = await getSlackGroupID(name)

    if (groupId) {
      return await client.groups.unarchive(groupId)
    }
  } catch(err) {
    console.log(err)
  }
}

async function setSlackGroupPurpose (groupId, purpose='') {

  if (!groupId) return new Error('missing_group_id')

  try {

    return await client.groups.setPurpose(groupId, purpose)
  } catch(err) {
    console.log(err)
  }
}


async function setSlackGroupTopic (groupId, topic='') {

  if (!groupId) return new Error('missing_group_id')

  try {

    return  await client.groups.setTopic(groupId, topic)
  } catch(err) {
    console.log(err)
  }
}

async function inviteBotToSlackGroup (groupId, userId) {

  if (!groupId) return new Error('missing_group_id')
  if (!userId) return new Error('missing_user_id')

  try {

    return await client.groups.invite(groupId, userId)

  } catch(err) {
    console.log(err)
  }
}

async function inviteToSlackGroup (groupId, userId) {

  if (!groupId) return new Error('missing_group_id')
  if (!userId) return new Error('missing_user_id')

  try {

    const adminId = await getSlackUserIDByEmail(admin)

    if (adminId && adminId === userId) return

    return await client.groups.invite(groupId, userId)

  } catch(err) {
    console.log(err)
  }
}

async function postMessageToSlack (id, text='') {

  if (!id) return new Error('missing_channel_id')

  try {

    return await bot.chat.postMessage(id, text)
  } catch(err) {
    console.log(err)
  }
}


async function getSlackUserID (name) {

  if (!name) return new Error('missing_name')

  try {

    const { data: { members } } = await client.users.list({
      limit: 1000
    })

    const user = members.find(user => `@${user.name}` === name)

    if (user) return user.id

  } catch(err) {
    console.log(err)
  }
}

async function getSlackUserIDByEmail (email) {

  if (!email) return new Error('missing_email')

  try {

    const teamID = await getSlackTeamID()

    const params = {
      team: teamID,
      token,
      email
    }

    const res = fetch(` https://slack.com/api/auth.findUser?${queryString.stringify(params)}`)

    if (res) {

      const { ok, user_id } = res.json()

      return user_id
    }
  } catch(err) {
    console.log(err)
  }
}

async function getSlackGroupID (name) {

  if (!name) return new Error('missing_name')

  try {

    const { data: { groups } } = await client.groups.list({
      limit: 1000,
      exclude_archived: true,
      exclude_members: true
    })

    const group = groups.find(group=> group.name.toLowerCase() === name.toLowerCase())

    if (group) return group.id

  } catch(err) {
    console.log(err)
  }
}

async function getSlackTeamID () {

  try {

    const { data: { team: { id } } } = await client.team.info()

    return id
  } catch (err) {
    console.log(err)
  }
}

async function getSlackProfile (userId) {

  if (!userId) return new Error('missing_user_id')

  try {

    const { data: { user } } = await client.users.info(userId)

    return user
  } catch(err) {
    console.log(err)
  }
}

async function retrieveSlackHistory (groupId) {

  if (!groupId) return new Error('missing_group_id')

  try {

    const { data: { messages } } = await client.groups.history(groupId, {
      count: 1000
    })

    return messages.filter((message) => message.type === 'message' && !message.subtype)

  } catch(err) {
    console.log(err)
  }
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
