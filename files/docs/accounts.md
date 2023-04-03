# Accounts

### POST /accounts/email/signup

This route lets a user create an account with an email and password.

**Query Parameters:**

- `password`: The password you want to use for the account. Must be at least 7 characters long.
- `confirmPassword`: This should be the same as your password.
- `email`: The email you want to use for the account.

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

**Response:**

- `token`: A UUID that lets you send web requests on behalf of an account.
- `accountId`: A Unique Identifier for your account that is used on servers. This is implemented so that in the future, if there is a way to change your email, your servers would still be there.

### DELETE /accounts/email

This route deletes an account.

**Query Parameters**

- `Password`
