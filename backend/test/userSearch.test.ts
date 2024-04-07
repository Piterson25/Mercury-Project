import { expect, test } from "vitest";
import { fetchData } from "./fetchData.js";

let page: number = 1;
let maxUsers: number = 100;
let query: string = "a";
let country: string = "Poland";

test("Search all users", async () => {
  const response = await fetchData(
    `http://localhost:5000/users/search?page=${page}&maxUsers=${maxUsers}`,
    "GET",
    {},
  );

  const { status, pageCount, users } = response;

  expect(status).toBe("ok");
  expect(pageCount).toBe(1);
  expect(users).toBeDefined();
  expect(users.length).toBe(27);
});

test("Search all users from Poland", async () => {
  const response = await fetchData(
    `http://localhost:5000/users/search?page=${page}&maxUsers=${maxUsers}&country=${country}`,
    "GET",
    {},
  );

  const { status, pageCount, users } = response;

  expect(status).toBe("ok");
  expect(pageCount).toBe(1);
  expect(users).toBeDefined();
  expect(users.length).toBe(3);
});

test("Missing page", async () => {
  const response = await fetchData(
    `http://localhost:5000/users/search?maxUsers=${maxUsers}`,
    "GET",
    {},
  );

  const { status, errors } = response;

  expect(status).toBe("error");
  expect(errors.page).toBe("not provided");
});

test("Missing maxUsers", async () => {
  const response = await fetchData(
    `http://localhost:5000/users/search?page=${page}`,
    "GET",
    {},
  );

  const { status, errors } = response;

  expect(status).toBe("error");
  expect(errors.maxUsers).toBe("not provided");
});

test("maxUsers as a text", async () => {
  const response = await fetchData(
    `http://localhost:5000/users/search?page=text?page=${page}&maxUsers=text`,
    "GET",
    {},
  );

  const { status, errors } = response;

  expect(status).toBe("error");
  expect(errors.maxUsers).toBe("not a number");
});

test("Missing page and maxUsers", async () => {
  const response = await fetchData(
    `http://localhost:5000/users/search`,
    "GET",
    {},
  );

  const { status, errors } = response;

  expect(status).toBe("error");
  expect(errors).toBeDefined();
  expect(errors.page).toBe("not provided");
  expect(errors.maxUsers).toBe("not provided");
});

test("First user from Lithuania", async () => {
  country = "Lithuania";
  const response = await fetchData(
    `http://localhost:5000/users/search?page=${page}&maxUsers=${maxUsers}&country=${country}`,
    "GET",
    {},
  );

  const { status, pageCount, users } = response;

  expect(status).toBe("ok");
  expect(pageCount).toBe(1);
  expect(users).toBeDefined();
  expect(users.length).toBe(2);
  expect(users[0].country).toBe("Lithuania");
  expect(users[1].country).toBe("Lithuania");
});

test("Not found users", async () => {
  country = "Germany";
  const response = await fetchData(
    `http://localhost:5000/users/search?page=${page}&maxUsers=${maxUsers}&country=${country}`,
    "GET",
    {},
  );

  const { status, pageCount, users } = response;

  expect(status).toBe("ok");
  expect(pageCount).toBe(1);
  expect(users).toBeDefined();
  expect(users.length).toBe(0);
});

test("Search with polish characters", async () => {
  query = "Adam Małysz";
  const response = await fetchData(
    `http://localhost:5000/users/search?page=${page}&maxUsers=${maxUsers}&q=${query}`,
    "GET",
    {},
  );

  const { status, errors } = response;

  expect(status).toBe("error");
  expect(errors).toBeDefined();
  expect(errors.q).toBe("not a valid string");
});
