"use server";

// Server actions for student mutations (list page + detail page).

import { revalidatePath } from "next/cache";
import { Organizations, Students } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { Student } from "@/lib/api/types";

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  sendInvite: boolean;
}

export async function createStudentAction(input: CreateStudentInput): Promise<Student> {
  const { sendInvite, ...body } = input;
  const student = await Students.createStudent({ body, ...(await authHeaders()) });
  if (sendInvite) {
    await Organizations.createInvite({
      body: { email: student.email, role: "student" },
      ...(await authHeaders()),
    });
  }
  revalidatePath("/students");
  return student;
}

export async function deleteStudentAction(id: string): Promise<void> {
  await Students.deleteStudent({ path: { id }, ...(await authHeaders()) });
  revalidatePath("/students");
}

export async function resendStudentInviteAction(email: string): Promise<void> {
  await Organizations.createInvite({
    body: { email, role: "student" },
    ...(await authHeaders()),
  });
}
