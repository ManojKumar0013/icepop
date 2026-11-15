import { act } from "react";
import { createRoot } from "react-dom/client";
import { storefrontApi } from "./api";
import { useStorefrontData } from "./useStorefrontData";

jest.mock("./api", () => ({ storefrontApi: { get: jest.fn() } }));

let root;
let request;

function TestView({ path }) {
  request = useStorefrontData(path);
  return null;
}

async function render(path = "/reviews/featured") {
  await act(async () => root.render(<TestView path={path} />));
  await advance(0);
}

async function advance(ms) {
  await act(async () => { jest.advanceTimersByTime(ms); });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  storefrontApi.get.mockReset();
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test("waits through a startup page and a 503 before accepting an empty review list", async () => {
  storefrontApi.get
    .mockResolvedValueOnce({ data: "<html>Starting service</html>" })
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockResolvedValueOnce({ data: [] });

  await render();
  expect(request).toMatchObject({ data: null, error: false });
  await advance(1000);
  expect(request).toMatchObject({ data: null, error: false });
  await advance(2000);
  expect(request).toMatchObject({ data: [], error: false });
});

test("offers a manual retry for a permanent error", async () => {
  const reviews = [{ id: 1 }];
  storefrontApi.get
    .mockRejectedValueOnce({ response: { status: 404 } })
    .mockResolvedValueOnce({ data: reviews });

  await render();
  expect(request).toMatchObject({ data: null, error: true });
  await act(async () => request.retry());
  expect(request).toMatchObject({ data: null, error: false });
  await advance(0);
  expect(request).toMatchObject({ data: reviews, error: false });
});

test("stops retrying after 90 seconds of timeouts", async () => {
  storefrontApi.get.mockImplementation((_path, { timeout }) => new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error("Request timed out")), timeout);
  }));

  await render();
  await advance(30000);
  await advance(1000);
  await advance(30000);
  await advance(2000);
  await advance(26999);
  expect(request).toMatchObject({ data: null, error: false });
  await advance(1);
  expect(request).toMatchObject({ data: null, error: true });
  expect(storefrontApi.get).toHaveBeenCalledTimes(3);
});

test("does not replace current menu results with a canceled search response", async () => {
  let finishOldSearch;
  const products = [{ id: 2 }];
  storefrontApi.get
    .mockImplementationOnce(() => new Promise((resolve) => { finishOldSearch = resolve; }))
    .mockResolvedValueOnce({ data: products });

  await render("/catalog/products?q=lime");
  const { signal } = storefrontApi.get.mock.calls[0][1];
  await render("/catalog/products?q=mango");
  expect(signal.aborted).toBe(true);
  await act(async () => finishOldSearch({ data: [{ id: 1 }] }));
  expect(request).toMatchObject({ data: products, error: false });
});
