import LogoSVG from "/logo.svg";
import { Link } from "react-router-dom";

function Banner() {
  return (
    <div className=" bg-my-dark py-2" id="banner">
      <Link to="/" className="flex flex-row justify-center">
        <img src={LogoSVG} alt="Mercury Logo" className=" h-32 w-32 pr-5 " />
        <span className=" self-center text-my-orange font-bold text-3xl md:text-5xl">
          {" "}
          Mercury
        </span>
      </Link>
    </div>
  );
}

export default Banner;
