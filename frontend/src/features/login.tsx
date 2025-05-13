import axios from "axios";

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
    <div>
      <button type="button" onClick={() => auth()} className="py-2 px-4">
        Sign In with Google
      </button>
    </div>
  );
};

export default Login;
