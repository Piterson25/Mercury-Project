import { useEffect, useState } from "react";

import Banner from "../components/Banner";
import Footer from "../components/Footer";
import LoginBox from "../components/LoginBox";
import Transition from "../components/Transition";

function LoginPage() {
  const [showAnimation, setShowAnim] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    setShowAnim(true);
    setTimeout(() => {
      setShowContent(true);
    }, 100);
  }, []);

  return (
    <>
      {showAnimation && <Transition startAnimation={showAnimation} />}
      {showContent ? (
        <div className=" min-h-screen flex flex-col bg-my-darker con">
          <Banner />
          <h1 className="text-xl md:text-3xl text-my-light text-center p-5">
            Login to your account
          </h1>
          <div className="flex justify-center">
            <LoginBox />
          </div>
          <Footer />
        </div>
      ) : (
        ""
      )}
    </>
  );
}

export default LoginPage;
