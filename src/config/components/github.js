const joi = require('joi')

const schema = joi.object({
  GH_TOKEN: joi.string().required(),
  GH_WEBHOOK_SECRET: joi.string().required(),
  GH_OWNER: joi.string().required(),
  GH_REPOSITORY: joi.string().required(),
  GH_ENDPOINT: joi.string().required(),
})
  .unkown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  github: {
    token: vars.GH_TOKEN,
    secret: vars.GH_WEBHOOK_SECRET,
    owner: vars.GH_OWNER,
    repo: vars.GH_REPOSITORY,
    graphql: vars.GH_ENDPOINT
  }
}

module.exports = config
