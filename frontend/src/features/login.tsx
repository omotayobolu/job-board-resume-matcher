import { Button } from "@/components/ui/button";
import axios from "axios";
import GoogleIcon from "../../src/assets/google.svg";
import OnboardingDesign from "@/components/onboarding-design";

function navigate(url: string) {
  window.location.href = url;
}
async function auth() {
  try {
    const response = await axios.post(
      "http://localhost:3000/auth/google/callback"
    );
    console.log(response);
    const data = response.data;
    navigate(data.url);
  } catch (error) {
    console.error(error);
  }
}

const Login = () => {
  return (
    <div className="w-full min-h-screen h-full flex flex-row">
      <OnboardingDesign />
      <div className="flex justify-center items-center lg:w-[60%] w-full bg-light-grey">
        <Button
          variant="primary"
          onClick={() => auth()}
          size="lg"
          className="font-normal"
        >
          <div className="flex flex-row items-center gap-4">
            <img src={GoogleIcon} alt="" />
            Continue with Google
          </div>
        </Button>
      </div>
    </div>
  );
};

export default Login;
