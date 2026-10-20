import AuthLayout from "@/components/auth-layout";
import FieldError from "@/components/field-error";
import PasswordInput from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api-error";
import { getHomePath } from "@/lib/auth";
import { axiosInstance } from "@/lib/axios-instance";
import { MAX_PASSWORD_LENGTH, validateEmail } from "@/lib/validation";
import { setUser, type UserType } from "@/store/userSlice";
import { useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";

interface SignInFields {
  email: string;
  password: string;
}

const SignIn = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInFields>({ defaultValues: { email: "", password: "" } });

  const onSubmit = async ({ email, password }: SignInFields) => {
    try {
      const { data } = await axiosInstance.post<{ user: UserType }>(
        "/auth/login",
        { email: email.trim(), password }
      );
      if (!data.user.role) {
        setError("root.server", {
          message: "This account has no role set. Create a new account to continue.",
        });
        return;
      }
      dispatch(setUser(data.user));
      navigate(getHomePath(data.user), { replace: true });
    } catch (error) {
      setError("root.server", {
        message: getApiErrorMessage(error, "Could not sign in. Try again."),
      });
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to JobBoard."
      switchPrompt="New to JobBoard?"
      switchLabel="Create an account"
      switchTo="/signup"
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-8 flex flex-col gap-3"
      >
        <div>
          <label htmlFor="email" className="block mb-2 font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            aria-invalid={!!errors.email}
            aria-describedby="email-error"
            {...register("email", { validate: validateEmail })}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="password" className="block mb-2 font-medium">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={!!errors.password}
            aria-describedby="password-error"
            {...register("password", {
              required: "Enter your password.",
              maxLength: {
                value: MAX_PASSWORD_LENGTH,
                message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
              },
            })}
          />
          <FieldError id="password-error" message={errors.password?.message} />
        </div>
        {errors.root?.server && (
          <p role="alert" className="text-red text-sm whitespace-pre-line">
            {errors.root.server.message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          className="w-full h-14 text-lg"
        >
          {isSubmitting ? "Please wait..." : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default SignIn;
