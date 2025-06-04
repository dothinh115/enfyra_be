import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("middleware_definition")
export class Middleware_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "text", nullable: false })
  handler: string;

  @Column({ type: "boolean", nullable: false, default: false })
  isEnabled: boolean;

  @Column({ type: "varchar", nullable: true })
  method: string;

  @Column({ type: "varchar", nullable: false })
  name: string;

  @Column({ type: "varchar", nullable: true })
  path: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}