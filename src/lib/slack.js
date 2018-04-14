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

    const channel = await getSlackGroupID(name)

    console.log(channel)

    if (channel) return channel

    const { group: { id } } = await client.groups.create(name)

    return id

  } catch (err) {
    console.log(err)
  }
}

async function archiveSlackGroup (name) {

  if (!name) return new Error('missing_name')

  try {

    const channel = await getSlackGroupID(name)

    if (channel) {
      return await client.groups.archive(channel)
    }
  } catch(err) {
    console.log(err)
  }
}

async function unarchiveSlackGroup (name) {

  if (!name) return new Error('missing_name')

  try {

    const channel = await getSlackGroupID(name)

    if (channel) {
      return await client.groups.unarchive(channel)
    }
  } catch(err) {
    console.log(err)
  }
}

async function setSlackGroupPurpose (channel, purpose='') {

  if (!channel) return new Error('missing_group_id')

  try {

    return await client.groups.setPurpose(channel, purpose)
  } catch(err) {
    console.log(err)
  }
}


async function setSlackGroupTopic (channel, topic='') {

  if (!channel) return new Error('missing_group_id')

  try {

    return  await client.groups.setTopic(channel, topic)
  } catch(err) {
    console.log(err)
  }
}

async function inviteBotToSlackGroup (channel, user) {

  if (!channel) return new Error('missing_group_id')
  if (!user) return new Error('missing_user_id')

  try {

    return await client.groups.invite(channel, user)

  } catch(err) {
    console.log(err)
  }
}

async function inviteToSlackGroup (channel, user) {

  if (!channel) return new Error('missing_group_id')
  if (!user) return new Error('missing_user_id')

  try {

    const adminId = await getSlackUserIDByEmail(admin)

    if (adminId === user) return

    return await client.groups.invite(channel, user)

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

  let allMembers = []

  const fetchUsers = async function (cursor=null) {

    const { members, response_metadata: { next_cursor } } = await client.users.list({
      cursor,
      limit: 200
    })

    if (next_cursor) {
      allMembers = [...allMembers, ...members]

      return await fetchUsers(next_cursor)
    }
  }

  try {

    await fetchUsers()

    const user = allMembers.find(user => `@${user.name}` === name)

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

    const res = await fetch(` https://slack.com/api/auth.findUser?${queryString.stringify(params)}`)

    const { ok, user_id } = await res.json()

      return user_id
  } catch(err) {
    console.log(err)
  }
}

async function getSlackGroupID (name) {

  if (!name) return new Error('missing_name')

  let allGroups = []

  const fetchGroups = async function (cursor=null) {

    const { groups, response_metadata: { next_cursor } } = await client.groups.list({
      cursor,
      limit: 200,
      exclude_members: true,
      exclude_archived: true
    })

    if (next_cursor) {
      allGroups = [...allGroups, ...groups]

      return await fetchGroups(next_cursor)
    }
  }

  try {

    await fetchGroups()

    const group = allGroups.find(group => group.name === name)

    if (group) return group.id

  } catch(err) {
    console.log(err)
  }
}

async function getSlackTeamID () {

  try {

    const { team: { id } } = await client.team.info()

    return id

  } catch (err) {
    console.log(err)
  }
}

async function getSlackProfile (userId) {

  if (!userId) return new Error('missing_user_id')

  try {

    const { user }  = await client.users.info(userId)

    return user

  } catch(err) {
    console.log(err)
  }
}

async function retrieveSlackHistory (channel) {

  if (!channel) return new Error('missing_group_id')

  try {

    const { messages } = await client.groups.history(channel, {
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
