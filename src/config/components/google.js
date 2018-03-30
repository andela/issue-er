const joi = require('joi')

const schema = joi.object({
  GDRIVE_TEAM_DIR_ID: joi.string().required(),
  GDRIVE_WORK_DIR: joi.string().required(),
  GDRIVE_URL: joi.string().required(),
  GS_TYPE: joi.string().required(),
  GS_PROJECT: joi.string().required(),
  GS_PROJECT_KEY_ID: joi.string().required(),
  GS_PRIVATE_KEY: joi.string().required(),
  GS_CLIENT_EMAIL: joi.string().required(),
  GS_CLIENT_ID: joi.string().required(),
  GS_AUTH_URL: joi.string().required(),
  GS_TOKEN_URL: joi.string().required(),
  GS_AUTH_PROVIDER: joi.string().required(),
  GS_CERT_URL: joi.string().required()
})
  .unknown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  google: {
    rootId: vars.GDDRIVE_TEAM_DIR_ID,
    workDir: vars.GDRIVE_WORK_DIR,
    url: vars.GDRIVE_URL,
    secret: {
      type: vars.GS_TYPE,
      project: vars.GS_PROJECT,
      private_key_id: vars.GS_PROJECT_KEY_ID,
      private_key: vars.GS_PRIVATE_KEY,
      client_email: vars.GS_CLIENT_EMAIL,
      client_id: vars.GS_CLIENT_ID,
      auth_uri: vars.GS_AUTH_URL,
      token_uri: vars.GS_TOKEN_URL,
      auth_provider_x509_cert_url: vars.GS_AUTH_PROVIDER,
      client_x509_cert_url: vars.GS_CERT_URL
    }
  }
}

module.exports = config
