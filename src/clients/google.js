const { google } = require('googleapis')

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectURL = process.env.GOOGLE_REDIRECT_URL

const OAuth2 = google.auth.OAuth2
const oauth2Client = new OAuth2(
  clientId,
  clientSecret,
  redirectURL
)

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
  })

}

module.exports = {
  client,
  createFolder
}

