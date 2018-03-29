const { google } = require('googleapis')

const config = require('../config')

const { id, secret, redirectURL } = config.google

const OAuth2 = google.auth.OAuth2
const oauth2Client = new OAuth2(id, secret, redirectURL)

const client = google.drive({
  version: 'v3',
  auth: oauth2Client
})

const createFolder = (name) => {
  client.files.insert({
    resource: {
      "title": name,
      // https://www.googleapis.com/drive/v2/files/*folderId*/children
      "parents": [ { "id": "root" }],
      "mimeType": "application/vnd.google-apps.folder"
    }
  }, (err, res) => {
    if (err) {
      console.log(err)
    }
    console.log(res)
  })

}

module.exports = {
  client,
  createFolder
}

