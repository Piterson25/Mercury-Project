import { useState } from "react";
import { Link } from "react-router-dom";
import { FrontendUser } from "../models/user.model";

const mailRegex = new RegExp("w+@w+[.]w+");

type ErrorHandlers = Record<keyof FrontendUser, (value: string) => string>;
const errorHandlers: ErrorHandlers = {
  first_name: (v) => {
    if (v.length < 2) {
      return "First name should be at least two characters long";
    }
    return "";
  },
  last_name: (v) => {
    if (v.length < 2) {
      return "Last name should be at least two characters long";
    }
    return "";
  },
  country: (_v) => {
    return "";
  },
  profile_picture: (_v) => {
    return "";
  },
  mail: (v) => {
    if (!mailRegex.test(v)) {
      return "Incorrect mail format";
    }
    return "";
  },
  password: (v) => {
    if (v.length < 8) {
      return "Password should be at least eight characters long";
    }
    return "";
  },
};

function RegisterBox() {
  const [user, setUser] = useState<Partial<FrontendUser>>({});
  const [errors, setErrors] = useState<Partial<FrontendUser>>({});

  const registerFunc = async () => {
    const response = await fetch("http://localhost:5000/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });
    const userJson = await response.json();
    console.log("Register " + JSON.stringify(userJson));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const input = (
    placeholder: string,
    type: string,
    name: keyof FrontendUser,
  ) => (
    <input
      className="text-my-dark form-input"
      type={type}
      name={name}
      onChange={handleChange}
      placeholder={placeholder}
    />
  );

  const error = (name: keyof FrontendUser) => (
    <div className="pb-4 text-[#f88]">{errors[name] || "No errors"}</div>
  );

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();

    const errors = Object.fromEntries(
      Object.entries(errorHandlers).map(([key, handler]) => {
        const formValue = user[key as keyof FrontendUser];
        if (!formValue) {
          return [key, "Required"];
        }

        return [key, handler(formValue)];
      }),
    );
    const noErrors = Object.values(errors).every((v) => v == "");

    if (noErrors) {
      console.log(user);
    } else {
      setErrors(errors);
    }
  };

  return (
    <form
      id="register-box"
      className="medium:w-[25vw] flex flex-col gap-2 bg-my-dark p-10 px-20 rounded-xl"
      onSubmit={handleSubmit}
    >
      <div>First and last name:</div>
      {input("First name", "text", "first_name")}
      {input("Last name", "text", "last_name")}
      {error("first_name")}
      {error("last_name")}

      <div>
        <span>Country:</span>
        {input("Country", "text", "country")}
        {error("country")}
      </div>

      <div>Profile picture:</div>
      {input("", "file", "profile_picture")}
      {error("profile_picture")}

      <div className="py-10">
        <div>E-mail:</div>
        {input("E-mail", "text", "mail")}
        {error("mail")}

        <div>Password:</div>
        {input("Password", "password", "password")}
        {error("password")}
      </div>

      <button className="btn small bg-my-orange" type="submit">
        Register
      </button>
      <div className="text-center">
        <p>Already have an account?</p>
        <p className="font-bold">
          <Link to="/login">Login</Link>
        </p>
      </div>
    </form>
  );
}

export default RegisterBox;
