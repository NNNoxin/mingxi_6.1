# MDN · Fetch API

> source: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
> captured: 2026-08-04T08:44:01.999Z
> provider: jina-reader

## [Concepts and usage](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#concepts_and_usage)

The Fetch API uses [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) and [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) objects (and other things involved with network requests), as well as related concepts such as CORS and the HTTP Origin header semantics.

For making a request and fetching a resource, use the [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch "fetch()") method. It is a global method in both [`Window`](https://developer.mozilla.org/en-US/docs/Web/API/Window) and [`Worker`](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope "Worker") contexts. This makes it available in pretty much any context you might want to fetch resources in.

The `fetch()` method takes one mandatory argument, the path to the resource you want to fetch. It returns a [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) that resolves to the [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) to that request — as soon as the server responds with headers — **even if the server response is an HTTP error status**. You can also optionally pass in an `init` options object as the second argument (see [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)).

Once a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) is retrieved, there are a number of methods available to define what the body content is and how it should be handled.

You can create a request and response directly using the [`Request()`](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request "Request()") and [`Response()`](https://developer.mozilla.org/en-US/docs/Web/API/Response/Response "Response()") constructors, but it's uncommon to do this directly. Instead, these are more likely to be created as results of other API actions (for example, [`FetchEvent.respondWith()`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/respondWith) from service workers).

Find out more about using the Fetch API features in [Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch).

### [Deferred Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#deferred_fetch)

The [`fetchLater()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetchLater "fetchLater()") API enables a developer to request a _deferred fetch_, that can be sent after a specified period of time, or when the page is closed or navigated away from. See [Using Deferred Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch).

## [Interfaces](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#interfaces)

[`Window.fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch) and [`WorkerGlobalScope.fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/fetch)
The `fetch()` method used to fetch a resource.

[`Window.fetchLater()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetchLater)
Used to make a deferred fetch request.

[`DeferredRequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/DeferredRequestInit)
Represents the set of options that can be used to configure a deferred fetch request.

[`FetchLaterResult`](https://developer.mozilla.org/en-US/docs/Web/API/FetchLaterResult)
Represents the result of requesting a deferred fetch.

[`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
Represents response/request headers, allowing you to query them and take different actions depending on the results.

[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)
Represents a resource request.

[`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
Represents the response to a request.

## [HTTP headers](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#http_headers)

[`deferred-fetch`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/deferred-fetch)
Controls the [top-level quota](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch#quotas) for the `fetchLater()` API.

[`deferred-fetch-minimal`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/deferred-fetch-minimal)
Controls the [shared cross-origin subframe quota](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch#quotas) for the `fetchLater()` API.

## [Specifications](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#specifications)

| Specification |
| --- |
| [Fetch # fetch-method](https://fetch.spec.whatwg.org/#fetch-method) |
| [Fetch # deferred-fetch](https://fetch.spec.whatwg.org/#deferred-fetch) |

## [Browser compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#browser_compatibility)

### [api.fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#api.fetch)

### [api.Window.fetchLater](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#api.Window.fetchLater)

## [See also](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#see_also)

*   [Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
*   [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
*   [HTTP access control (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
*   [HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP)
*   [Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)
