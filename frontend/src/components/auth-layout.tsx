import BrandLogo from "@/components/brand-logo";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  switchPrompt: string;
  switchLabel: string;
  switchTo: string;
  children: ReactNode;
}

const AuthLayout = ({
  title,
  subtitle,
  switchPrompt,
  switchLabel,
  switchTo,
  children,
}: AuthLayoutProps) => {
  return (
    <div className="w-full min-h-screen flex flex-col bg-light-grey">
      <header className="px-6 sm:px-12 py-5">
        <BrandLogo />
      </header>
      <div className="flex-1 flex justify-center items-center w-full px-4 py-10">
        <div className="bg-white w-full max-w-lg rounded-3xl p-8 sm:p-12 shadow-sm">
          <h1 className="text-dark-grey text-3xl font-semibold">{title}</h1>
          <p className="text-dark-grey mt-2">{subtitle}</p>
          {children}
          <p className="mt-6 text-center text-dark-grey">
            {switchPrompt}{" "}
            <Link
              to={switchTo}
              className="text-purple font-semibold underline underline-offset-2"
            >
              {switchLabel}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
