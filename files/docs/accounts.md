# Accounts

### POST /accounts/email/signup

This route lets a user create an account with an email and password.

**Query Parameters:**

- `password`: The password you want to use for the account. Must be at least 7 characters long.
- `confirmPassword`: This should be the same as your password.
- `email`: The email you want to use for the account.
- `cloudflareVerifyToken`: If the instance has setup cloudflare turnstile, this is the token that is returned by cloudflare after it succesfully verifies a user is human.

**Response:**

- `token`: A UUID that lets you send web requests on behalf of an account.
- `accountId`: A Unique Identifier for your account that is used on servers. This is implemented so that in the future, if there is a way to change your email, your servers would still be there.

### POST /accounts/email/resetPassword/

**Query Parameters**

- `email`
- `password`
- `confirmPassword`
- `last4`: The last four digits of your credit card. This is required if payment is enabled.

You have five attempts to reset your password.

### POST /accounts/email/signin

This route lets a user sign in to an already existing email-based account.

**Query Parameters**

- `password`
- `email`
- `cloudflareVerifyToken`: If the instance has setup cloudflare turnstile, this is the token that is returned by cloudflare after it succesfully verifies a user is human.

**Response:**

- `token`: A UUID that lets you send web requests on behalf of an account.
- `accountId`: A Unique Identifier for your account that is used on servers. This is implemented so that in the future, if there is a way to change your email, your servers would still be there.

### DELETE /accounts/email

This route deletes an account.

**Query Parameters**

- `Password`

### POST /discord

This is the combined signin and signup route for accounts with discord

**Query Parameters**

- `token`: The token returned by discord after the user authorizes your application.

### DELETE /discord

This lets you delete your account on the quartz instance that was created with discord.

**No Parameters**