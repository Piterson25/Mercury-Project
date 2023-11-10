import { expect, test } from "vitest";

let userId: number;

test("Create user", async () => {
  const userData = {
    nick: "Tommy",
    password: "12345",
    first_name: "Tom",
    last_name: "Hanks",
    country: "USA",
    profile_picture: "https://example.com/tommy.jpg",
    mail: "tom.hanks@example.com",
  };

  const response = await fetch("http://localhost:5000/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  });

  const responseData = await response.json();
  const user = responseData.user;
  const status = responseData.status;

  expect(status).toBe("ok");

  userId = user.id;
});

test("Fetch user by ID", async () => {
  const response = await fetch(`http://localhost:5000/users/${userId}`);
  const responseData = await response.json();
  const status = responseData.status;

  expect(status).toBe("ok");
});

test("Update user by ID", async () => {
  const userUpdateData = {
    nick: "Tommy",
    password: "54321",
    first_name: "Tommy",
    last_name: "Hanks",
    country: "Canada",
    profile_picture: "https://example.com/tommy.jpg",
    mail: "tommy.hanks@example.com",
  };

  const response = await fetch(`http://localhost:5000/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userUpdateData),
  });

  const responseData = await response.json();
  const status = responseData.status;

  expect(status).toBe("ok");
});

test("Delete user by ID", async () => {
  const response = await fetch(`http://localhost:5000/users/${userId}`, {
    method: "DELETE",
  });

  const responseData = await response.json();
  const status = responseData.status;

  expect(status).toBe("ok");
});

test("Get user's friends", async () => {
  const usersResponse = await fetch("http://localhost:5000/users")
  const usersResponseData = await usersResponse.json();
  const usersStatus = usersResponseData.status

  expect(usersStatus).toBe("ok")

  const zuck = usersResponseData.users.find(
    (user: any) => user.nick == "rEptiliAn69"
  )
  const zuckId = zuck.id

  const response = await fetch(`http://localhost:5000/users/${zuckId}/friends`)
  const responseData = await response.json();
  const { status, friends } = responseData

  expect(status).toBe("ok")
  expect(friends).toHaveLength(2)
})

test("Search users", async () => {
  const usersResponse = await fetch("http://localhost:5000/users/search?q=zuckerberg")
  const usersResponseData = await usersResponse.json();
  const usersStatus = usersResponseData.status

  expect(usersStatus).toBe("ok")

  const zuck = usersResponseData.users.find(
    ([user, _score]: any) => user.nick == "rEptiliAn69"
  )

  expect(zuck).toBeDefined()
})
