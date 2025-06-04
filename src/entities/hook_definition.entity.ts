import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("hook_definition")
export class Hook_definition {
  @Column({ type: "varchar", nullable: false, default: "beforeHandler" })
  type: string;

  @Column({ type: "text", nullable: false })
  handler: string;

  @Column({ type: "varchar", nullable: false })
  path: string;

  @Column({ type: "varchar", nullable: false, default: "GET" })
  method: string;

  @PrimaryGeneratedColumn('increment')
  id: number;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}