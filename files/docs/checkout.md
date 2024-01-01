# Checkout

### POST /checkout/`plan`/

This route returns a client secret that frontends need to show a stripe checkout window that works.

**Path Parameters**

- `plan`: Either `basic` or `modded`.

**Query Parameters**

- `quantity`: How many servers the user/you want(s) to order.
