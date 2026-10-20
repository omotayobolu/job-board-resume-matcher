interface FieldErrorProps {
  id: string;
  message?: string;
}

const FieldError = ({ id, message }: FieldErrorProps) =>
  message ? (
    <p id={id} className="mt-1 text-red text-sm">
      {message}
    </p>
  ) : null;

export default FieldError;
