Arth Quartz provides a REST api allowing frontends to create and manage serves, change settings, access a server's terminal, and more. Besides contributing to Observer, you may want to know this to create an alternative frontend, or to manage your servers by directly making web requests.

# Universal Header Parameters

These parameters will be needed to make a request on behalf of an account. The exceptions are `/accounts/email/signup` and `/accounts/email/signin`, which don't require universal headers.

- `token`: A UUID that lets you send web requests on behalf of an account. This is returned by `/accounts/email/signup` and `/accounts/email/signin` upon a successful request.

- `email`: The email of a user's account.
