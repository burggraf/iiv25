const jwt = require('jsonwebtoken')
const fs = require('fs')

const privateKey = fs.readFileSync('/path/to/Apple_AuthKey_XXXXXXXXXX.p8')
const teamId = 'team-id-top-right-apple-dev-site'
const keyId = 'key-id-from-your-service'
const clientId = 'id.of.your.service'

const token = jwt.sign(
	{
		iss: teamId,
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 6 * 30 * 24 * 60 * 60, // 6 months
		aud: 'https://appleid.apple.com',
		sub: clientId,
	},
	privateKey,
	{
		algorithm: 'ES256',
		header: { kid: keyId },
	}
)
console.log(token)
