import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, ListOrdered, Sparkles, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <BriefcaseBusiness size={22} />,
    title: "Create the role",
    description:
      "Write the job once. Every CV is screened against that description, the skills, and the location.",
  },
  {
    icon: <Upload size={22} />,
    title: "Drop in the applicants",
    description:
      "Add the CVs for a role in one go. Shortlistly reads them so your team does not have to open every file.",
  },
  {
    icon: <ListOrdered size={22} />,
    title: "Get a ranked shortlist",
    description:
      "Applicants come back in order, with a score and a short explanation of why they are high or low.",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-light-grey flex flex-col">
      <header className="flex items-center justify-between px-6 sm:px-12 py-5">
        <Logo />
        <Button asChild variant="primary" className="rounded-full px-6">
          <Link to="/login">Sign in</Link>
        </Button>
      </header>

      <main className="flex-1">
        <section className="px-6 sm:px-12 pt-12 pb-16 text-center max-w-4xl mx-auto">
          <p className="text-purple font-semibold tracking-wide">
            For recruiting agencies and hiring teams
          </p>
          <h1 className="font-bold text-dark-grey text-4xl sm:text-6xl leading-tight mt-4">
            Drop in your applicants, get a ranked shortlist with reasons in minutes.
          </h1>
          <p className="text-dark-grey/80 text-lg sm:text-xl mt-6 leading-8">
            Shortlistly helps small recruiting agencies and in-house hiring teams,
            anywhere in the world, turn a pile of CVs into a shortlist they can explain.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild variant="primary" className="rounded-full h-14 px-8 text-lg">
              <Link to="/signup">Start screening</Link>
            </Button>
          </div>
        </section>

        <section className="px-6 sm:px-12 pb-16 max-w-6xl mx-auto">
          <div className="bg-white rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-dark-grey">How screening works</h2>
            <ul className="mt-6 grid gap-6 md:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="flex gap-4">
                  <span className="shrink-0 size-11 rounded-full bg-purple/10 text-purple flex items-center justify-center">
                    {feature.icon}
                  </span>
                  <div>
                    <p className="font-semibold text-dark-grey">{feature.title}</p>
                    <p className="text-dark-grey/80 mt-1">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-6 sm:px-12 pb-20 max-w-4xl mx-auto">
          <div className="bg-purple rounded-3xl p-8 sm:p-12 text-center text-white">
            <Sparkles className="mx-auto" size={28} />
            <h2 className="text-2xl sm:text-3xl font-semibold mt-4">Reasons, not just a score</h2>
            <p className="mt-4 text-light-grey leading-7">
              Each person on the shortlist includes what matches the role and what is missing,
              so a recruiter can defend the ranking to a client or a hiring manager.
            </p>
          </div>
        </section>
      </main>

      <footer className="px-6 sm:px-12 py-6 flex justify-center">
        <Logo className="[&_img]:size-6 [&_span]:text-lg" />
      </footer>
    </div>
  );
};

export default Landing;
