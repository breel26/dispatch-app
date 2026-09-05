import { notFound } from "next/navigation";
import { getPersonnelById } from "@/modules/inventory/repository";
import PersonnelForm from "../../PersonnelForm";
import { updatePersonnelAction } from "../../../actions";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface EditPersonnelPageProps {
  params: Promise<{ id: string }>;
}

// A DATE column comes back from Prisma as a Date at midnight; formatting
// to yyyy-mm-dd here (rather than via toISOString, which is UTC-based and
// can roll to the wrong calendar day for a caller in a negative UTC
// offset) keeps it aligned with what the <input type="date"> in
// PersonnelForm expects.
function toDateInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function EditPersonnelPage({ params }: EditPersonnelPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const personnel = await getPersonnelById(orgId, id);
  if (!personnel) notFound();

  return (
    <div>
      <h1>Edit Personnel</h1>
      <PersonnelForm
        action={updatePersonnelAction.bind(null, id)}
        submitLabel="Save Changes"
        // Built explicitly rather than spreading `personnel` - the record
        // carries ssnEncrypted/driversLicenseNumberEncrypted, and those
        // must never be forwarded as a prop into this Client Component
        // (see the note on modules/inventory/repository.ts). Only a
        // boolean "is one on file" crosses that boundary.
        initialValues={{
          employeeId: personnel.employeeId,
          firstName: personnel.firstName,
          middleName: personnel.middleName,
          lastName: personnel.lastName,
          dateOfBirth: toDateInputValue(personnel.dateOfBirth),
          hireDate: toDateInputValue(personnel.hireDate),
          hasSsnOnFile: personnel.ssnEncrypted !== null,
          hasDriversLicenseOnFile: personnel.driversLicenseNumberEncrypted !== null,
          homeStreet1: personnel.homeStreet1,
          homeStreet2: personnel.homeStreet2,
          homeCity: personnel.homeCity,
          homeState: personnel.homeState,
          homePostalCode: personnel.homePostalCode,
          phoneNumber: personnel.phoneNumber,
          craft: personnel.craft,
          classification: personnel.classification,
          certifications: personnel.certifications,
          isActive: personnel.isActive,
        }}
      />
    </div>
  );
}
