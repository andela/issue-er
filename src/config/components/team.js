const joi = require('joi')

const schema = joi.object({
  MANAGERS: joi.string().required(),
  NAMESPACE: joi.string().required()
})
  .unknown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  team: {
    managers: vars.MANAGERS.split(','),
    namespace: vars.NAMESPACE
  }
}

module.exports = config
