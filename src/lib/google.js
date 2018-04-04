const { google } = require('googleapis')

const config = require('../config')

const { secret, scopes, workDir } = config.google

const jwtClient = new google.auth.JWT({
  email: secret.client_email,
  key: secret.private_key,
  scopes,
})

const drive = google.drive({
  version: 'v3',
  auth: jwtClient
})

const MIME_TYPE = "application/vnd.google-apps.folder"

function workspace () {
  return new Promise(async (resolve, reject) => {
    const folder = await findFolder(workDir)
    if (folder) return resolve(folder)
    return createFolder(workDir)
      .then(({ data }) => resolve(data))
      .catch(err => reject(err))
  })
}

function findFolder (name) {
  if (!name) return

  const params = {
    supportsTeamDrives: true,
    includeTeamDriveItems: true,
    pageSize: 1,
    fields: `files(id, name), incompleteSearch`
  }

  params.q = `mimeType='${MIME_TYPE}' and name contains '${name}'`

  return new Promise((resolve, reject) => {
    return drive.files.list(params)
      .then(({ data: { files } }) => {
        const file = files.find(file => file.name === name)

        if (!file)  return resolve(null)
        return getFolder(file)
          .then(res => resolve(res.data))
          .catch(err => reject(err))
      }).catch(err => reject(err))
  })
}

function getFolder (file) {
  if (!file.id) throw new Error(`Must specify an 'id' property`)
  const params = {
    fileId: file.id,
    supportsTeamDrives: true,
    fields: `id, name, parents`
  }
  return new Promise((resolve, reject) => {
    return drive.files.get(params)
      .then(file => resolve(file))
      .catch(err => reject(err))
  })
}

function createFolder (name, parents=[]) {
  if (!name) return
  return new Promise(async (resolve, reject) => {
    const folder = await findFolder(name)
    if (folder) return resolve(folder)
    const resource = {
      name,
      parents,
      mimeType: MIME_TYPE,
    }
    const params = {
      supportsTeamDrives: true,
      fields: `id, name`
    }
    return drive.files.create({
      resource,
      ...params
    })
      .then(({ data: { id, name } }) => {
        return resolve({ id, name })
      })
      .catch(err => reject(err))
  })
}

module.exports = {
  client: jwtClient,
  createFolder,
  findFolder,
  getFolder,
  workspace
}

