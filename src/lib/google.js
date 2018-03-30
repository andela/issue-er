const { google } = require('googleapis')
const jsonfile = require('jsonfile')

const config = require('../config')

const { secret, workDir } = config.google

const file = '/tmp/secret.json'
jsonfile.writeFileSync(file, secret, { spaces: 2 })

const OAuth2 = google.auth.OAuth2
const oauth2Client = new OAuth2(file)

const drive = google.drive({
  version: 'v3',
  auth: oauth2Client
})

const MIME_TYPE='application/vnd.google-apps.folder'

function workspace () {
  return new Promise((resolve, reject) => {
    findFolder(workDir)
      .then(async (res) => {
        let ws
        if (Object.keys(res).length === 0) {
          ws = await createFolder(workDir)
        }
        return resolve(res || ws)
      })
      .catch(err => {
        console.log(err)
        return reject(err)
      })
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
    return drive.files.list(params, (err, res) => {
      if (err) return reject(err)
      if (!res) return null
      return getFolder(res.files[0].id)
        .then((res) => {
          return resolve(res)
        })
        .catch((err) => {
          console.log(err)
          return reject(err)
        })
    })
  })
}

function getFolder (fileId) {
  if (!fileId) return

  const params = {
    fileId,
    supportsTeamDrives: true,
    fields: `id, name, parents`
  }
  return new Promise((resolve, reject) => {
    drive.files.get(params, (err, res) => {
      if (err) return reject(err)
      return resolve(res)
    })
  })
}

function createFolder (name, parents=[]) {
  if (!name) return
  return new Promise((resolve, reject) => {
    return findFolder(name)
      .then((res) => {
        if (res.id && Object.keys(res) !== 0) return resolve(res)
        const fileMetadata = {
          name,
          parents,
          mimeType: MIME_TYPE,
          fields: `id, name`
        }
        drive.files.insert({
          resource: fileMetadata
        }, (err, res) => {
          if (err) return reject(err)
          console.log(res)
          return resolve(res)
        })
      })
      .catch(err => {
        console.log(err)
      })

  })
}

module.exports = {
  createFolder,
  findFolder,
  getFolder,
  workspace
}

