import axios from "axios";
import { useForm } from "react-hook-form";

const Dashboard = () => {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<FormDataInputs>();

  interface FormDataInputs {
    job_title: string;
    location: string;
    remote_preference: string;
    resume: FileList;
  }

  const onsubmit = (data: FormDataInputs) => {
    const formData = new FormData();
    formData.append("user_id", "2aff6bae-d76a-4fff-8dee-488c355cb872");
    formData.append("job_title", data.job_title);
    formData.append("location", data.location);
    formData.append("remote_preference", data.remote_preference);
    formData.append("resume", data.resume[0]);
    console.log(data.resume[0]);

    axios
      .post("http://localhost:3000/api/v1/job-seeker/create-profile", formData)
      .then((res) => console.log(res));
  };
  return (
    <div>
      <form
        onSubmit={handleSubmit(onsubmit)}
        className="space-y-4 max-w-md mx-auto"
      >
        <div>
          <label>Job Title</label>
          <input
            type="text"
            {...register("job_title", { required: "Job title is required" })}
            className="w-full border p-2"
          />
          {errors.job_title && (
            <p className="text-red-500">{String(errors.job_title.message)}</p>
          )}
        </div>

        <div>
          <label>Location</label>
          <input
            type="text"
            {...register("location", { required: "Location is required" })}
            className="w-full border p-2"
          />
          {errors.location && (
            <p className="text-red-500">{String(errors.location.message)}</p>
          )}
        </div>

        <div>
          <label>Remote Preference</label>
          <select
            {...register("remote_preference", {
              required: "Please select a preference",
            })}
            className="w-full border p-2"
          >
            <option value="">Select one</option>
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="On-site">On-site</option>
          </select>
          {errors.remote_preference && (
            <p className="text-red-500">
              {errors.remote_preference?.message?.toString()}
            </p>
          )}
        </div>

        <div>
          <label>Resume (PDF or DOC)</label>
          <input
            type="file"
            accept=".pdf,.docx"
            {...register("resume", { required: "Resume is required" })}
            className="w-full"
          />
          {errors.resume && (
            <p className="text-red-500">{String(errors.resume.message)}</p>
          )}
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Submit
        </button>
      </form>
    </div>
  );
};

export default Dashboard;
