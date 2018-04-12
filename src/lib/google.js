const { google } = require('googleapis')

const config = require('../config')

const { secret, scopes, workDir } = config.google

const jwtClient = new google.auth.JWT({
  email: secret.client_email,
  key: secret.private_key,
  scopes
})

const drive = google.drive({
  version: 'v3',
  auth: jwtClient
})

const MIME_TYPE = "application/vnd.google-apps.folder"

async function workspace () {
  try {

    const folder = await findFolder(workDir)

    if (folder) return folder

    return await createFolder(workDir)

  } catch (err) {
    console.log(err)
  }
}

async function findFolder (name) {

  if (!name) return

  const params = {
    supportsTeamDrives: true,
    includeTeamDriveItems: true,
    pageSize: 1,
    fields: `files(id, name), incompleteSearch`
  }

  params.q = `mimeType='${MIME_TYPE}' and name contains '${name}'`

  try {

    const { data: { files } } = await drive.files.list(params)

    const file = files.find(file => file.name === name)

    if (file) return file

    return await getFolder(file)

  } catch(err) {
    console.log(err)
  }
}

async function getFolder (file) {

  if (!file.id) throw new Error(`Must specify an 'id' property`)

  const params = {
    fileId: file.id,
    supportsTeamDrives: true,
    fields: `id, name, parents`
  }

  try {

    return await drive.files.get(params)
  } catch(err) {
    console.log(err)
  }
}

async function createFolder (name, parents=[]) {

  if (!name) return

  try {

    const folder = await findFolder(name)

    if (folder) return folder

    const resource = {
      name,
      parents,
      mimeType: MIME_TYPE,
    }
    const params = {
      supportsTeamDrives: true,
      fields: `id, name`
    }
   
    const { data: { id, name } } =  await drive.files.create({
      resource,
      ...params
    })

    return { id, name }
  } catch (err) {
    console.log(err)   
  }
}

module.exports = {
  createFolder,
  findFolder,
  getFolder,
  workspace
}

