import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import ChatBox from "../components/ChatBox";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useProtected } from "../helpers/Protected";
import { useUser } from "../helpers/UserContext";

function MessagingPage() {
  const navigate = useNavigate();
  const navigating = useRef<boolean>(false);
  const { friendId } = useParams();
  const { userState, socket } = useUser();
  const { user } = useProtected();

  useEffect(() => {
    if (navigating.current) return;
    if (userState.status == "loading") return;

    if (friendId === null) {
      navigating.current = true;
      navigate("/friends");
    }
  }, [user, friendId]);

  const showChatBox = user && socket && friendId;

  return (
    <>
      <Navbar />
      {showChatBox ? (
        <ChatBox user={user} socket={socket} friendId={friendId} />
      ) : null}
      <Footer />
    </>
  );
}

export default MessagingPage;
