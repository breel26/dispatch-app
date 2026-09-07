import { listPersonnel } from "@/modules/inventory/repository";
import { exportPersonnelToExcel } from "@/modules/import-export/excel/exportPersonnel";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { xlsxDownload, unauthorizedIfSignedOut } from "../../exportResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireAuthContext();

    // activeOnly: false - the export carries an Active column, so leaving
    // inactive workers out would make a re-import look like everyone left
    // the company is being deleted.
    const personnel = await listPersonnel(orgId, false);

    const buffer = await exportPersonnelToExcel(
      // Mapped field by field on purpose, never spread. These rows carry
      // ssnEncrypted and driversLicenseNumberEncrypted, and the rule is
      // that neither leaves the server - see the note at the top of
      // exportPersonnel.ts and on Personnel.ssnEncrypted in schema.prisma.
      // Spreading here would put them one careless exporter change away
      // from a file on someone's laptop.
      personnel.map((person) => ({
        employeeId: person.employeeId,
        firstName: person.firstName,
        middleName: person.middleName,
        lastName: person.lastName,
        dateOfBirth: person.dateOfBirth,
        hireDate: person.hireDate,
        homeStreet1: person.homeStreet1,
        homeStreet2: person.homeStreet2,
        homeCity: person.homeCity,
        homeState: person.homeState,
        homePostalCode: person.homePostalCode,
        homeCountry: person.homeCountry,
        phoneNumber: person.phoneNumber,
        craft: person.craft,
        classification: person.classification,
        certifications: person.certifications,
        isActive: person.isActive,
      }))
    );

    return xlsxDownload(buffer, "personnel");
  } catch (err) {
    return unauthorizedIfSignedOut(err);
  }
}
