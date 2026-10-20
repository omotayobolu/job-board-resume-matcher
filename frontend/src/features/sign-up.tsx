import AuthLayout from "@/components/auth-layout";
import FieldError from "@/components/field-error";
import PasswordInput from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api-error";
import { getHomePath } from "@/lib/auth";
import { axiosInstance } from "@/lib/axios-instance";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateEmail,
} from "@/lib/validation";
import { setUser, type Role, type UserType } from "@/store/userSlice";
import { useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";

interface SignUpFields {
  fullName: string;
  email: string;
  role: Role | null;
  password: string;
  confirmPassword: string;
}

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 120;
const ROLE_ERROR = "Choose Job Seeker or Recruiter.";

const ROLE_OPTIONS: ReadonlyArray<{ value: Role; label: string }> = [
  { value: "job_seeker", label: "Job Seeker" },
  { value: "recruiter", label: "Recruiter" },
];

function validateFullName(value: string): true | string {
  const length = value.trim().length;
  if (length === 0) return "Enter your full name.";
  if (length < MIN_NAME_LENGTH) {
    return `Name must be at least ${MIN_NAME_LENGTH} characters.`;
  }
  if (length > MAX_NAME_LENGTH) {
    return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return true;
}

const SignUp = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFields>({
    defaultValues: {
      fullName: "",
      email: "",
      role: null,
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async ({ fullName, email, role, password }: SignUpFields) => {
    try {
      const { data } = await axiosInstance.post<{ user: UserType }>(
        "/auth/register",
        { full_name: fullName.trim(), email: email.trim(), password, role }
      );
      dispatch(setUser(data.user));
      navigate(getHomePath(data.user), { replace: true });
    } catch (error) {
      setError("root.server", {
        message: getApiErrorMessage(
          error,
          "Could not create your account. Try again."
        ),
      });
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Sign up to find jobs or hire talent."
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      switchTo="/login"
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-8 flex flex-col gap-3"
      >
        <div>
          <label htmlFor="full-name" className="block mb-2 font-medium">
            Full name
          </label>
          <Input
            id="full-name"
            type="text"
            autoComplete="name"
            placeholder="Enter your full name"
            aria-invalid={!!errors.fullName}
            aria-describedby="full-name-error"
            {...register("fullName", { validate: validateFullName })}
          />
          <FieldError id="full-name-error" message={errors.fullName?.message} />
        </div>
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
        <fieldset aria-describedby="role-error">
          <legend className="block mb-2 font-medium">I am a</legend>
          <div className="flex gap-6">
            {ROLE_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  value={value}
                  {...register("role", { required: ROLE_ERROR })}
                />
                {label}
              </label>
            ))}
          </div>
          <FieldError id="role-error" message={errors.role?.message} />
        </fieldset>
        <div>
          <label htmlFor="password" className="block mb-2 font-medium">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Create a password"
            aria-invalid={!!errors.password}
            aria-describedby="password-error"
            {...register("password", {
              required: "Enter your password.",
              minLength: {
                value: MIN_PASSWORD_LENGTH,
                message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
              },
              maxLength: {
                value: MAX_PASSWORD_LENGTH,
                message: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
              },
            })}
          />
          <FieldError id="password-error" message={errors.password?.message} />
          {!errors.password && (
            <p className="mt-1 text-sm">
              Use at least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="confirm-password" className="block mb-2 font-medium">
            Confirm password
          </label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby="confirm-password-error"
            {...register("confirmPassword", {
              required: "Confirm your password.",
              validate: (value) =>
                value === getValues("password") || "Passwords do not match.",
            })}
          />
          <FieldError
            id="confirm-password-error"
            message={errors.confirmPassword?.message}
          />
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
          {isSubmitting ? "Please wait..." : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default SignUp;
