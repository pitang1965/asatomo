ALTER TABLE "connections" DROP CONSTRAINT "connections_other_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_other_user_id_user_id_fk" FOREIGN KEY ("other_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;