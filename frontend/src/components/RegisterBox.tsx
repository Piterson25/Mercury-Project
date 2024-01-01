import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { userSchema } from "../models/RegisterUserSchema";
import { FrontendUser } from "../models/User";
import userPlaceholder from "../assets/user-placeholder.jpg";

function RegisterBox() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FrontendUser>({
    resolver: zodResolver(userSchema),
  });

  const [submitError, setSubmitError] = useState<string>("");
  const [profilePictureBase64, setProfilePictureBase64] = useState<string>("");
  const [pictureFile, setPictureFile] = useState<File>();

  const errorProps = {
    className: "pb-4 text-[#f88]",
  };

  const inputProps = {
    className: "text-my-dark form-input",
  };

  const countryOptions = {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const start = input.selectionStart;
      const end = input.selectionEnd;

      input.value = e.target.value.toUpperCase();
      input.setSelectionRange(start, end);
    },
  };

  const registerUser = async (user: FrontendUser): Promise<FrontendUser> => {
    const response = await fetch("http://localhost:5000/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });

    if (!response.ok) {
      throw response;
    }

    const userJson = await response.json();
    console.log("Register " + JSON.stringify(userJson));

    return userJson.user;
  };

  const encodePicture = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePictureBase64(reader.result as string);
      console.log(profilePictureBase64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPictureFile(file);
      encodePicture(file);
    }
  };

  const createFileFromBlob = (
    blob: Blob,
    fileName: string,
    fileType: string,
  ): File => {
    const file = new File([blob], fileName, { type: fileType });
    return file;
  };

  const fetchDefaultPhoto = async () => {
    try {
      const response = await fetch(userPlaceholder);
      if (response.ok) {
        const blob = await response.blob();
        const myFile = createFileFromBlob(
          blob,
          "user-placeholder.jpg",
          "image/jpeg",
        );
        setPictureFile(myFile);
        encodePicture(myFile);
        console.log(myFile);
      } else {
        throw new Error("Failed to fetch image");
      }
    } catch (error) {
      console.error("Error fetching image:", error);
    }
  };

  const submit = async (user: FrontendUser) => {
    try {
      if (!pictureFile) {
        await fetchDefaultPhoto();
      }

      user.profile_picture = profilePictureBase64;

      const registered = await registerUser(user);

      console.log(registered);
      navigate("/login");
    } catch (e) {
      if (e instanceof Error) {
        setSubmitError("Can't connect to the server");
        throw e;
      }

      if ((e as Response).status == 400) {
        setSubmitError("User already exists");
      } else {
        setSubmitError("Unknown error");
      }
    }
  };

  return (
    <form
      id="register-box"
      className="medium:w-[25vw] flex flex-col gap-2 bg-my-dark p-10 px-20 rounded-xl"
      onSubmit={handleSubmit(submit)}
    >
      <div>First name:</div>
      <input
        {...inputProps}
        {...register("first_name")}
        placeholder="First name"
      />
      <div {...errorProps}>{errors.first_name?.message}</div>
      <div>Last Name:</div>
      <input
        {...inputProps}
        {...register("last_name")}
        placeholder="Last name"
      />
      <div {...errorProps}>{errors.last_name?.message}</div>
      <div>
        <div className="flex gap-2 items-center">
          <div>Country:</div>
          <input
            {...inputProps}
            {...register("country", countryOptions)}
            placeholder="Country"
          />
        </div>
        <div {...errorProps}>{errors.country?.message}</div>
      </div>

      <div>Profile picture:</div>
      <input
        {...inputProps}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />
      <p> {pictureFile?.name}</p>
      <div {...errorProps}>{errors.profile_picture?.message}</div>

      <div className="py-5">
        <div>E-mail:</div>
        <input {...inputProps} {...register("mail")} placeholder="E-mail" />
        <div {...errorProps}>{errors.mail?.message}</div>

        <div>Password:</div>
        <input
          {...inputProps}
          {...register("password")}
          type="password"
          placeholder="Password"
        />
        <div {...errorProps}>{errors.password?.message}</div>
      </div>

      <div className="pb-4 text-[#f88]">{submitError}</div>

      <input
        disabled={isSubmitting}
        type="submit"
        className="btn small bg-my-orange disabled:bg-my-dark"
        value="Register"
      />

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
