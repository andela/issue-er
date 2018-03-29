const joi = require('joi')

const schema = joi.object({
  SLACK_BOT_TOKEN: joi.string().required(),
  SLACK_TOKEN: joi.string().required(),
  SLACK_TEAM: joi.string().required()
})
  .unkown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  slack: {
    bot: vars.SLACK_BOT_TOKEN,
    token: vars.SLACK_TOKEN,
    team: vars.SLACK_TEAM
  }
}

module.exports = config
