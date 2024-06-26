import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useUser } from "../helpers/UserContext";

function LoginBox() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState("");

  const { userState, login: userLogin } = useUser();
  const firstVisit = useRef<boolean>(true);

  const loginFunc = async () => {
    userLogin(login, password);
  };

  useEffect(() => {
    if (userState.status == "loading") return;

    if (userState.status == "anonymous") {
      if (firstVisit.current) {
        firstVisit.current = false;
        return;
      }

      setLoginMsg("Bad credentials");
    } else {
      navigate("/profile", { replace: true });
      setLoginMsg("Logging in...");
    }
  }, [userState]);

  return (
    <div
      className=" medium:w-[25vw] flex flex-col gap-2 bg-my-dark p-10 px-20 rounded-xl"
      id="login-box"
    >
      <div>E-mail:</div>
      <input
        type="text"
        className="text-my-dark form-input"
        placeholder="E-mail"
        name="email"
        onChange={(e) => setLogin(e.target.value)}
      />

      <div>Password:</div>
      <input
        type="password"
        className="text-my-dark form-input"
        placeholder="Password"
        name="password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="btn small my-4 bg-my-orange"
        data-testid="Login"
        onClick={() => loginFunc()}
      >
        Login
      </button>
      <div className="text-center">
        <p>New to Mercury?</p>
        <p className="font-bold">
          <Link to="/register">Create a new account</Link>
        </p>
        <div className="text-red">{loginMsg}</div>
      </div>
    </div>
  );
}

export default LoginBox;
