"use server";

// Server actions for student mutations (list page + detail page).

import { revalidatePath } from "next/cache";
import { Organizations, Students } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { Student } from "@/lib/api/types";

export interface CreateStudentInput {
  name: string;
  email: string;
  sendInvite: boolean;
}

export async function createStudentAction(input: CreateStudentInput): Promise<Student> {
  const { sendInvite, email, name } = input;
  const student = await Students.createStudent(
    {
      email,
      firstName: name,
      lastName: "-",
    },
    await authHeaders(),
  );
  if (sendInvite) {
    await Organizations.createInvite(
      { email: student.email, role: "student" },
      await authHeaders(),
    );
  }
  revalidatePath("/students");
  return student;
}

export async function deleteStudentAction(id: string): Promise<void> {
  await Students.deleteStudent({ id }, await authHeaders());
  revalidatePath("/students");
}

export async function resendStudentInviteAction(email: string): Promise<void> {
  await Organizations.createInvite({ email, role: "student" }, await authHeaders());
}
